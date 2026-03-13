"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const entitlements_1 = require("../../src/shared/entitlements");
describe("Entitlements System", () => {
    describe("AgentType and FeatureType", () => {
        it("should define all expected agent types", () => {
            const expectedAgents = [
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
            const expectedFeatures = [
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
            expect(entitlements_1.AGENT_DEPENDENCIES["OPS_AGENT"]).toEqual([]);
        });
        it("should have INVENTORY_AGENT depend on OPS_AGENT", () => {
            expect(entitlements_1.AGENT_DEPENDENCIES["INVENTORY_AGENT"]).toContain("OPS_AGENT");
        });
        it("should have FINANCE_AGENT depend on OPS_AGENT", () => {
            expect(entitlements_1.AGENT_DEPENDENCIES["FINANCE_AGENT"]).toContain("OPS_AGENT");
        });
        it("should have MARKETING_AGENT depend on OPS_AGENT", () => {
            expect(entitlements_1.AGENT_DEPENDENCIES["MARKETING_AGENT"]).toContain("OPS_AGENT");
        });
        it("should have SUPPORT_AGENT depend on OPS_AGENT", () => {
            expect(entitlements_1.AGENT_DEPENDENCIES["SUPPORT_AGENT"]).toContain("OPS_AGENT");
        });
        it("should have CONTENT_AGENT as standalone (no dependencies)", () => {
            expect(entitlements_1.AGENT_DEPENDENCIES["CONTENT_AGENT"]).toEqual([]);
        });
    });
    describe("FEATURE_DEPENDENCIES", () => {
        it("should have CONVERSATIONS with no dependencies", () => {
            expect(entitlements_1.FEATURE_DEPENDENCIES["CONVERSATIONS"]).toEqual([]);
        });
        it("should have INVENTORY depend on CATALOG", () => {
            expect(entitlements_1.FEATURE_DEPENDENCIES["INVENTORY"]).toContain("CATALOG");
        });
        it("should have PAYMENTS depend on ORDERS", () => {
            expect(entitlements_1.FEATURE_DEPENDENCIES["PAYMENTS"]).toContain("ORDERS");
        });
        it("should have REPORTS depend on ORDERS", () => {
            expect(entitlements_1.FEATURE_DEPENDENCIES["REPORTS"]).toContain("ORDERS");
        });
        it("should have LOYALTY depend on ORDERS", () => {
            expect(entitlements_1.FEATURE_DEPENDENCIES["LOYALTY"]).toContain("ORDERS");
        });
        it("should have KPI_DASHBOARD depend on ORDERS", () => {
            expect(entitlements_1.FEATURE_DEPENDENCIES["KPI_DASHBOARD"]).toContain("ORDERS");
        });
    });
    describe("validateEntitlements", () => {
        it("should validate a minimal valid configuration", () => {
            const entitlements = {
                enabledAgents: ["OPS_AGENT"],
                enabledFeatures: ["CONVERSATIONS", "ORDERS", "CATALOG"],
            };
            const result = (0, entitlements_1.validateEntitlements)(entitlements);
            expect(result.valid).toBe(true);
            expect(result.missingAgents).toEqual([]);
            expect(result.missingFeatures).toEqual([]);
        });
        it("should detect missing agent dependencies", () => {
            // INVENTORY_AGENT requires OPS_AGENT
            const entitlements = {
                enabledAgents: ["INVENTORY_AGENT"],
                enabledFeatures: ["INVENTORY"],
            };
            const result = (0, entitlements_1.validateEntitlements)(entitlements);
            expect(result.valid).toBe(false);
            expect(result.missingAgents).toContain("OPS_AGENT");
        });
        it("should detect missing feature dependencies", () => {
            // INVENTORY requires CATALOG
            const entitlements = {
                enabledAgents: ["OPS_AGENT"],
                enabledFeatures: ["INVENTORY"],
            };
            const result = (0, entitlements_1.validateEntitlements)(entitlements);
            expect(result.valid).toBe(false);
            expect(result.missingFeatures).toContain("CATALOG");
        });
        it("should validate complete professional tier", () => {
            const entitlements = {
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
            const result = (0, entitlements_1.validateEntitlements)(entitlements);
            expect(result.valid).toBe(true);
        });
    });
    describe("resolveEntitlementDependencies", () => {
        it("should add OPS_AGENT when INVENTORY_AGENT is requested", () => {
            const entitlements = {
                enabledAgents: ["INVENTORY_AGENT"],
                enabledFeatures: ["INVENTORY"],
            };
            const result = (0, entitlements_1.resolveEntitlementDependencies)(entitlements);
            expect(result.enabledAgents).toContain("OPS_AGENT");
            expect(result.enabledAgents).toContain("INVENTORY_AGENT");
        });
        it("should add CATALOG when INVENTORY is requested", () => {
            const entitlements = {
                enabledAgents: ["OPS_AGENT"],
                enabledFeatures: ["INVENTORY"],
            };
            const result = (0, entitlements_1.resolveEntitlementDependencies)(entitlements);
            expect(result.enabledFeatures).toContain("CATALOG");
            expect(result.enabledFeatures).toContain("INVENTORY");
        });
        it("should add ORDERS when KPI_DASHBOARD is requested", () => {
            const entitlements = {
                enabledAgents: [],
                enabledFeatures: ["KPI_DASHBOARD"],
            };
            const result = (0, entitlements_1.resolveEntitlementDependencies)(entitlements);
            // KPI_DASHBOARD -> ORDERS -> CONVERSATIONS
            expect(result.enabledFeatures).toContain("KPI_DASHBOARD");
            expect(result.enabledFeatures).toContain("ORDERS");
            expect(result.enabledFeatures).toContain("CONVERSATIONS");
        });
    });
    describe("hasAgent", () => {
        it("should return true if agent is enabled", () => {
            const entitlements = {
                enabledAgents: ["OPS_AGENT", "INVENTORY_AGENT"],
                enabledFeatures: [],
            };
            expect((0, entitlements_1.hasAgent)(entitlements, "OPS_AGENT")).toBe(true);
        });
        it("should return false if agent is not enabled", () => {
            const entitlements = {
                enabledAgents: ["OPS_AGENT"],
                enabledFeatures: [],
            };
            expect((0, entitlements_1.hasAgent)(entitlements, "FINANCE_AGENT")).toBe(false);
        });
    });
    describe("hasFeature", () => {
        it("should return true if feature is enabled", () => {
            const entitlements = {
                enabledAgents: [],
                enabledFeatures: ["CONVERSATIONS", "ORDERS"],
            };
            expect((0, entitlements_1.hasFeature)(entitlements, "CONVERSATIONS")).toBe(true);
        });
        it("should return false if feature is not enabled", () => {
            const entitlements = {
                enabledAgents: [],
                enabledFeatures: ["CONVERSATIONS", "ORDERS"],
            };
            expect((0, entitlements_1.hasFeature)(entitlements, "INVENTORY")).toBe(false);
        });
    });
    describe("Display Names", () => {
        it("should return display name for agents", () => {
            expect((0, entitlements_1.getAgentDisplayName)("OPS_AGENT")).toBe("Operations Agent");
            expect((0, entitlements_1.getAgentDisplayName)("INVENTORY_AGENT")).toBe("Inventory Agent");
        });
        it("should return display name for features", () => {
            expect((0, entitlements_1.getFeatureDisplayName)("CONVERSATIONS")).toBe("Conversations");
            expect((0, entitlements_1.getFeatureDisplayName)("INVENTORY")).toBe("Inventory");
        });
    });
});
