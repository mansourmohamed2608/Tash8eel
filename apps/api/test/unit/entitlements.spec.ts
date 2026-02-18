import {
  AgentType,
  FeatureType,
  AGENT_DEPENDENCIES,
  FEATURE_DEPENDENCIES,
  validateEntitlements,
  resolveEntitlementDependencies,
  hasAgent,
  hasFeature,
  MerchantEntitlements,
  getAgentDisplayName,
  getFeatureDisplayName,
} from "../../src/shared/entitlements";

describe("Entitlements System", () => {
  describe("AgentType and FeatureType", () => {
    it("should define all expected agent types", () => {
      const expectedAgents: AgentType[] = [
        "OPS_AGENT",
        "INVENTORY_AGENT",
        "FINANCE_AGENT",
        "MARKETING_AGENT",
        "SUPPORT_AGENT",
        "CONTENT_AGENT",
      ];

      expectedAgents.forEach((agent) => {
        expect([
          "OPS_AGENT",
          "INVENTORY_AGENT",
          "FINANCE_AGENT",
          "MARKETING_AGENT",
          "SUPPORT_AGENT",
          "CONTENT_AGENT",
        ]).toContain(agent);
      });
    });

    it("should define all expected feature types", () => {
      const expectedFeatures: FeatureType[] = [
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
        "LOYALTY",
        "NOTIFICATIONS",
        "AUDIT_LOGS",
        "KPI_DASHBOARD",
        "API_ACCESS",
      ];

      expect(expectedFeatures.length).toBe(15);
    });
  });

  describe("AGENT_DEPENDENCIES", () => {
    it("should have OPS_AGENT with no dependencies", () => {
      expect(AGENT_DEPENDENCIES["OPS_AGENT"]).toEqual([]);
    });

    it("should have INVENTORY_AGENT depend on OPS_AGENT", () => {
      expect(AGENT_DEPENDENCIES["INVENTORY_AGENT"]).toContain("OPS_AGENT");
    });

    it("should have FINANCE_AGENT depend on OPS_AGENT", () => {
      expect(AGENT_DEPENDENCIES["FINANCE_AGENT"]).toContain("OPS_AGENT");
    });

    it("should have MARKETING_AGENT depend on OPS_AGENT", () => {
      expect(AGENT_DEPENDENCIES["MARKETING_AGENT"]).toContain("OPS_AGENT");
    });

    it("should have SUPPORT_AGENT depend on OPS_AGENT", () => {
      expect(AGENT_DEPENDENCIES["SUPPORT_AGENT"]).toContain("OPS_AGENT");
    });

    it("should have CONTENT_AGENT as standalone (no dependencies)", () => {
      expect(AGENT_DEPENDENCIES["CONTENT_AGENT"]).toEqual([]);
    });
  });

  describe("FEATURE_DEPENDENCIES", () => {
    it("should have CONVERSATIONS with no dependencies", () => {
      expect(FEATURE_DEPENDENCIES["CONVERSATIONS"]).toEqual([]);
    });

    it("should have INVENTORY depend on CATALOG", () => {
      expect(FEATURE_DEPENDENCIES["INVENTORY"]).toContain("CATALOG");
    });

    it("should have PAYMENTS depend on ORDERS", () => {
      expect(FEATURE_DEPENDENCIES["PAYMENTS"]).toContain("ORDERS");
    });

    it("should have REPORTS depend on ORDERS", () => {
      expect(FEATURE_DEPENDENCIES["REPORTS"]).toContain("ORDERS");
    });

    it("should have LOYALTY depend on ORDERS", () => {
      expect(FEATURE_DEPENDENCIES["LOYALTY"]).toContain("ORDERS");
    });

    it("should have KPI_DASHBOARD depend on ORDERS", () => {
      expect(FEATURE_DEPENDENCIES["KPI_DASHBOARD"]).toContain("ORDERS");
    });
  });

  describe("validateEntitlements", () => {
    it("should validate a minimal valid configuration", () => {
      const entitlements: MerchantEntitlements = {
        enabledAgents: ["OPS_AGENT"],
        enabledFeatures: ["CONVERSATIONS", "ORDERS", "CATALOG"],
      };
      const result = validateEntitlements(entitlements);

      expect(result.valid).toBe(true);
      expect(result.missingAgents).toEqual([]);
      expect(result.missingFeatures).toEqual([]);
    });

    it("should detect missing agent dependencies", () => {
      // INVENTORY_AGENT requires OPS_AGENT
      const entitlements: MerchantEntitlements = {
        enabledAgents: ["INVENTORY_AGENT"],
        enabledFeatures: ["INVENTORY"],
      };
      const result = validateEntitlements(entitlements);

      expect(result.valid).toBe(false);
      expect(result.missingAgents).toContain("OPS_AGENT");
    });

    it("should detect missing feature dependencies", () => {
      // INVENTORY requires CATALOG
      const entitlements: MerchantEntitlements = {
        enabledAgents: ["OPS_AGENT"],
        enabledFeatures: ["INVENTORY"],
      };
      const result = validateEntitlements(entitlements);

      expect(result.valid).toBe(false);
      expect(result.missingFeatures).toContain("CATALOG");
    });

    it("should validate complete professional tier", () => {
      const entitlements: MerchantEntitlements = {
        enabledAgents: [
          "OPS_AGENT",
          "INVENTORY_AGENT",
          "FINANCE_AGENT",
          "SUPPORT_AGENT",
        ],
        enabledFeatures: [
          "CONVERSATIONS",
          "ORDERS",
          "CATALOG",
          "INVENTORY",
          "PAYMENTS",
          "REPORTS",
          "NOTIFICATIONS",
          "KPI_DASHBOARD",
        ],
      };
      const result = validateEntitlements(entitlements);

      expect(result.valid).toBe(true);
    });
  });

  describe("resolveEntitlementDependencies", () => {
    it("should add OPS_AGENT when INVENTORY_AGENT is requested", () => {
      const entitlements: MerchantEntitlements = {
        enabledAgents: ["INVENTORY_AGENT"],
        enabledFeatures: ["INVENTORY"],
      };
      const result = resolveEntitlementDependencies(entitlements);

      expect(result.enabledAgents).toContain("OPS_AGENT");
      expect(result.enabledAgents).toContain("INVENTORY_AGENT");
    });

    it("should add CATALOG when INVENTORY is requested", () => {
      const entitlements: MerchantEntitlements = {
        enabledAgents: ["OPS_AGENT"],
        enabledFeatures: ["INVENTORY"],
      };
      const result = resolveEntitlementDependencies(entitlements);

      expect(result.enabledFeatures).toContain("CATALOG");
      expect(result.enabledFeatures).toContain("INVENTORY");
    });

    it("should add ORDERS when KPI_DASHBOARD is requested", () => {
      const entitlements: MerchantEntitlements = {
        enabledAgents: [],
        enabledFeatures: ["KPI_DASHBOARD"],
      };
      const result = resolveEntitlementDependencies(entitlements);

      // KPI_DASHBOARD -> ORDERS -> CONVERSATIONS
      expect(result.enabledFeatures).toContain("KPI_DASHBOARD");
      expect(result.enabledFeatures).toContain("ORDERS");
      expect(result.enabledFeatures).toContain("CONVERSATIONS");
    });
  });

  describe("hasAgent", () => {
    it("should return true if agent is enabled", () => {
      const entitlements: MerchantEntitlements = {
        enabledAgents: ["OPS_AGENT", "INVENTORY_AGENT"],
        enabledFeatures: [],
      };
      expect(hasAgent(entitlements, "OPS_AGENT")).toBe(true);
    });

    it("should return false if agent is not enabled", () => {
      const entitlements: MerchantEntitlements = {
        enabledAgents: ["OPS_AGENT"],
        enabledFeatures: [],
      };
      expect(hasAgent(entitlements, "FINANCE_AGENT")).toBe(false);
    });
  });

  describe("hasFeature", () => {
    it("should return true if feature is enabled", () => {
      const entitlements: MerchantEntitlements = {
        enabledAgents: [],
        enabledFeatures: ["CONVERSATIONS", "ORDERS"],
      };
      expect(hasFeature(entitlements, "CONVERSATIONS")).toBe(true);
    });

    it("should return false if feature is not enabled", () => {
      const entitlements: MerchantEntitlements = {
        enabledAgents: [],
        enabledFeatures: ["CONVERSATIONS", "ORDERS"],
      };
      expect(hasFeature(entitlements, "INVENTORY")).toBe(false);
    });
  });

  describe("Display Names", () => {
    it("should return display name for agents", () => {
      expect(getAgentDisplayName("OPS_AGENT")).toBe("Operations Agent");
      expect(getAgentDisplayName("INVENTORY_AGENT")).toBe("Inventory Agent");
    });

    it("should return display name for features", () => {
      expect(getFeatureDisplayName("CONVERSATIONS")).toBe("Conversations");
      expect(getFeatureDisplayName("INVENTORY")).toBe("Inventory");
    });
  });
});
