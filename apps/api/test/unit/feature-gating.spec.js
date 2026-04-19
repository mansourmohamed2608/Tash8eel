"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const testing_1 = require("@nestjs/testing");
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const entitlement_guard_1 = require("../../src/shared/guards/entitlement.guard");
const database_module_1 = require("../../src/infrastructure/database/database.module");
// Mock Pool for database queries
const mockPool = {
    query: jest.fn(),
};
describe("Feature Gating - EntitlementGuard", () => {
    let guard;
    let reflector;
    beforeEach(async () => {
        const module = await testing_1.Test.createTestingModule({
            providers: [
                entitlement_guard_1.EntitlementGuard,
                core_1.Reflector,
                { provide: database_module_1.DATABASE_POOL, useValue: mockPool },
            ],
        }).compile();
        guard = module.get(entitlement_guard_1.EntitlementGuard);
        reflector = module.get(core_1.Reflector);
    });
    afterEach(() => {
        jest.clearAllMocks();
    });
    const createMockContext = (merchantId) => {
        return {
            switchToHttp: () => ({
                getRequest: () => ({ merchantId }),
            }),
            getHandler: () => ({}),
            getClass: () => ({}),
        };
    };
    describe("OPS Endpoints Feature Gating", () => {
        describe("CONVERSATIONS feature", () => {
            it("should allow access when merchant has CONVERSATIONS feature", async () => {
                mockPool.query.mockResolvedValueOnce({
                    rows: [
                        {
                            enabled_agents: ["OPS_AGENT"],
                            enabled_features: ["CONVERSATIONS", "ORDERS", "CATALOG"],
                        },
                    ],
                });
                jest.spyOn(reflector, "getAllAndOverride").mockImplementation((key) => {
                    if (key === entitlement_guard_1.REQUIRES_FEATURE_KEY)
                        return "CONVERSATIONS";
                    return undefined;
                });
                const context = createMockContext("test-merchant");
                const result = await guard.canActivate(context);
                expect(result).toBe(true);
            });
            it("should return 403 when merchant lacks CONVERSATIONS feature", async () => {
                mockPool.query.mockResolvedValue({
                    rows: [
                        {
                            enabled_agents: ["OPS_AGENT"],
                            enabled_features: ["ORDERS", "CATALOG"], // No CONVERSATIONS
                        },
                    ],
                });
                jest.spyOn(reflector, "getAllAndOverride").mockImplementation((key) => {
                    if (key === entitlement_guard_1.REQUIRES_FEATURE_KEY)
                        return "CONVERSATIONS";
                    return undefined;
                });
                const context = createMockContext("test-merchant");
                await expect(guard.canActivate(context)).rejects.toThrow(common_1.ForbiddenException);
            });
        });
        describe("ORDERS feature", () => {
            it("should allow access when merchant has ORDERS feature", async () => {
                mockPool.query.mockResolvedValueOnce({
                    rows: [
                        {
                            enabled_agents: ["OPS_AGENT"],
                            enabled_features: ["CONVERSATIONS", "ORDERS", "CATALOG"],
                        },
                    ],
                });
                jest.spyOn(reflector, "getAllAndOverride").mockImplementation((key) => {
                    if (key === entitlement_guard_1.REQUIRES_FEATURE_KEY)
                        return "ORDERS";
                    return undefined;
                });
                const context = createMockContext("test-merchant");
                const result = await guard.canActivate(context);
                expect(result).toBe(true);
            });
            it("should return 403 when merchant lacks ORDERS feature", async () => {
                mockPool.query.mockResolvedValueOnce({
                    rows: [
                        {
                            enabled_agents: ["OPS_AGENT"],
                            enabled_features: ["CONVERSATIONS", "CATALOG"], // No ORDERS
                        },
                    ],
                });
                jest.spyOn(reflector, "getAllAndOverride").mockImplementation((key) => {
                    if (key === entitlement_guard_1.REQUIRES_FEATURE_KEY)
                        return "ORDERS";
                    return undefined;
                });
                const context = createMockContext("test-merchant");
                await expect(guard.canActivate(context)).rejects.toThrow(common_1.ForbiddenException);
            });
        });
        describe("CATALOG feature", () => {
            it("should return 403 when merchant lacks CATALOG feature", async () => {
                mockPool.query.mockResolvedValue({
                    rows: [
                        {
                            enabled_agents: ["OPS_AGENT"],
                            enabled_features: ["CONVERSATIONS", "ORDERS"], // No CATALOG
                        },
                    ],
                });
                jest.spyOn(reflector, "getAllAndOverride").mockImplementation((key) => {
                    if (key === entitlement_guard_1.REQUIRES_FEATURE_KEY)
                        return "CATALOG";
                    return undefined;
                });
                const context = createMockContext("test-merchant");
                await expect(guard.canActivate(context)).rejects.toThrow(common_1.ForbiddenException);
            });
        });
        describe("REPORTS feature", () => {
            it("should return 403 when merchant lacks REPORTS feature", async () => {
                mockPool.query.mockResolvedValueOnce({
                    rows: [
                        {
                            enabled_agents: ["OPS_AGENT"],
                            enabled_features: ["CONVERSATIONS", "ORDERS", "CATALOG"], // No REPORTS
                        },
                    ],
                });
                jest.spyOn(reflector, "getAllAndOverride").mockImplementation((key) => {
                    if (key === entitlement_guard_1.REQUIRES_FEATURE_KEY)
                        return "REPORTS";
                    return undefined;
                });
                const context = createMockContext("test-merchant");
                await expect(guard.canActivate(context)).rejects.toThrow(common_1.ForbiddenException);
            });
            it("should allow access when merchant has REPORTS feature", async () => {
                mockPool.query.mockResolvedValueOnce({
                    rows: [
                        {
                            enabled_agents: ["OPS_AGENT", "FINANCE_AGENT"],
                            enabled_features: [
                                "CONVERSATIONS",
                                "ORDERS",
                                "CATALOG",
                                "REPORTS",
                            ],
                        },
                    ],
                });
                jest.spyOn(reflector, "getAllAndOverride").mockImplementation((key) => {
                    if (key === entitlement_guard_1.REQUIRES_FEATURE_KEY)
                        return "REPORTS";
                    return undefined;
                });
                const context = createMockContext("test-merchant");
                const result = await guard.canActivate(context);
                expect(result).toBe(true);
            });
        });
        describe("VOICE_NOTES feature", () => {
            it("should return 403 when merchant lacks VOICE_NOTES feature", async () => {
                mockPool.query.mockResolvedValueOnce({
                    rows: [
                        {
                            enabled_agents: ["OPS_AGENT"],
                            enabled_features: ["CONVERSATIONS", "ORDERS", "CATALOG"], // No VOICE_NOTES
                        },
                    ],
                });
                jest.spyOn(reflector, "getAllAndOverride").mockImplementation((key) => {
                    if (key === entitlement_guard_1.REQUIRES_FEATURE_KEY)
                        return "VOICE_NOTES";
                    return undefined;
                });
                const context = createMockContext("test-merchant");
                await expect(guard.canActivate(context)).rejects.toThrow(common_1.ForbiddenException);
            });
        });
    });
    describe("Loyalty Endpoints Feature Gating", () => {
        describe("LOYALTY feature + MARKETING_AGENT", () => {
            it("should allow access when merchant has both LOYALTY feature and MARKETING_AGENT", async () => {
                mockPool.query.mockResolvedValueOnce({
                    rows: [
                        {
                            enabled_agents: ["OPS_AGENT", "MARKETING_AGENT"],
                            enabled_features: [
                                "CONVERSATIONS",
                                "ORDERS",
                                "CATALOG",
                                "LOYALTY",
                            ],
                        },
                    ],
                });
                // First call for feature check
                jest.spyOn(reflector, "getAllAndOverride").mockImplementation((key) => {
                    if (key === entitlement_guard_1.REQUIRES_FEATURE_KEY)
                        return "LOYALTY";
                    if (key === entitlement_guard_1.REQUIRES_AGENT_KEY)
                        return "MARKETING_AGENT";
                    return undefined;
                });
                const context = createMockContext("test-merchant");
                const result = await guard.canActivate(context);
                expect(result).toBe(true);
            });
            it("should return 403 when merchant lacks LOYALTY feature", async () => {
                mockPool.query.mockResolvedValue({
                    rows: [
                        {
                            enabled_agents: ["OPS_AGENT", "MARKETING_AGENT"],
                            enabled_features: ["CONVERSATIONS", "ORDERS", "CATALOG"], // No LOYALTY
                        },
                    ],
                });
                jest.spyOn(reflector, "getAllAndOverride").mockImplementation((key) => {
                    if (key === entitlement_guard_1.REQUIRES_FEATURE_KEY)
                        return "LOYALTY";
                    if (key === entitlement_guard_1.REQUIRES_AGENT_KEY)
                        return "MARKETING_AGENT";
                    return undefined;
                });
                const context = createMockContext("test-merchant");
                await expect(guard.canActivate(context)).rejects.toThrow(common_1.ForbiddenException);
            });
            it("should return 403 when merchant lacks MARKETING_AGENT", async () => {
                const mockRows = {
                    rows: [
                        {
                            enabled_agents: ["OPS_AGENT"], // No MARKETING_AGENT
                            enabled_features: [
                                "CONVERSATIONS",
                                "ORDERS",
                                "CATALOG",
                                "LOYALTY",
                            ],
                        },
                    ],
                };
                mockPool.query.mockResolvedValue(mockRows);
                jest.spyOn(reflector, "getAllAndOverride").mockImplementation((key) => {
                    if (key === entitlement_guard_1.REQUIRES_AGENT_KEY)
                        return "MARKETING_AGENT";
                    if (key === entitlement_guard_1.REQUIRES_FEATURE_KEY)
                        return "LOYALTY";
                    return undefined;
                });
                const context = createMockContext("test-merchant");
                await expect(guard.canActivate(context)).rejects.toThrow(common_1.ForbiddenException);
            });
            it("should return 403 when STARTER plan merchant tries to access loyalty", async () => {
                // STARTER plan typically only has OPS_AGENT and basic features
                mockPool.query.mockResolvedValueOnce({
                    rows: [
                        {
                            enabled_agents: ["OPS_AGENT"],
                            enabled_features: [
                                "CONVERSATIONS",
                                "ORDERS",
                                "CATALOG",
                                "VOICE_NOTES",
                                "NOTIFICATIONS",
                            ],
                        },
                    ],
                });
                jest.spyOn(reflector, "getAllAndOverride").mockImplementation((key) => {
                    if (key === entitlement_guard_1.REQUIRES_FEATURE_KEY)
                        return "LOYALTY";
                    if (key === entitlement_guard_1.REQUIRES_AGENT_KEY)
                        return "MARKETING_AGENT";
                    return undefined;
                });
                const context = createMockContext("starter-merchant");
                await expect(guard.canActivate(context)).rejects.toThrow(common_1.ForbiddenException);
            });
        });
    });
    describe("General Guard Behavior", () => {
        it("should return 403 for inactive merchant", async () => {
            mockPool.query.mockResolvedValue({ rows: [] }); // No merchant found
            jest.spyOn(reflector, "getAllAndOverride").mockImplementation((key) => {
                if (key === entitlement_guard_1.REQUIRES_FEATURE_KEY)
                    return "ORDERS";
                return undefined;
            });
            const context = createMockContext("inactive-merchant");
            await expect(guard.canActivate(context)).rejects.toThrow(common_1.ForbiddenException);
        });
        it("should allow access when no feature/agent requirements", async () => {
            jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(undefined);
            const context = createMockContext("any-merchant");
            const result = await guard.canActivate(context);
            expect(result).toBe(true);
            expect(mockPool.query).not.toHaveBeenCalled(); // No DB query needed
        });
        it("should throw error if merchantId not present on request", async () => {
            jest.spyOn(reflector, "getAllAndOverride").mockImplementation((key) => {
                if (key === entitlement_guard_1.REQUIRES_FEATURE_KEY)
                    return "ORDERS";
                return undefined;
            });
            const context = {
                switchToHttp: () => ({
                    getRequest: () => ({}), // No merchantId
                }),
                getHandler: () => ({}),
                getClass: () => ({}),
            };
            await expect(guard.canActivate(context)).rejects.toThrow(common_1.ForbiddenException);
        });
        it("should use default entitlements when null in database", async () => {
            mockPool.query.mockResolvedValueOnce({
                rows: [
                    {
                        enabled_agents: null,
                        enabled_features: null,
                    },
                ],
            });
            jest.spyOn(reflector, "getAllAndOverride").mockImplementation((key) => {
                if (key === entitlement_guard_1.REQUIRES_FEATURE_KEY)
                    return "CONVERSATIONS";
                return undefined;
            });
            const context = createMockContext("test-merchant");
            // Default features include CONVERSATIONS, so this should pass
            const result = await guard.canActivate(context);
            expect(result).toBe(true);
        });
    });
    describe("Finance Agent Feature Gating", () => {
        it("should allow access to PAYMENTS when FINANCE_AGENT and PAYMENTS feature enabled", async () => {
            mockPool.query.mockResolvedValueOnce({
                rows: [
                    {
                        enabled_agents: ["OPS_AGENT", "FINANCE_AGENT"],
                        enabled_features: [
                            "CONVERSATIONS",
                            "ORDERS",
                            "CATALOG",
                            "PAYMENTS",
                        ],
                    },
                ],
            });
            jest.spyOn(reflector, "getAllAndOverride").mockImplementation((key) => {
                if (key === entitlement_guard_1.REQUIRES_FEATURE_KEY)
                    return "PAYMENTS";
                return undefined;
            });
            const context = createMockContext("pro-merchant");
            const result = await guard.canActivate(context);
            expect(result).toBe(true);
        });
        it("should return 403 when merchant lacks PAYMENTS feature", async () => {
            mockPool.query.mockResolvedValueOnce({
                rows: [
                    {
                        enabled_agents: ["OPS_AGENT"],
                        enabled_features: ["CONVERSATIONS", "ORDERS", "CATALOG"], // No PAYMENTS
                    },
                ],
            });
            jest.spyOn(reflector, "getAllAndOverride").mockImplementation((key) => {
                if (key === entitlement_guard_1.REQUIRES_FEATURE_KEY)
                    return "PAYMENTS";
                return undefined;
            });
            const context = createMockContext("basic-merchant");
            await expect(guard.canActivate(context)).rejects.toThrow(common_1.ForbiddenException);
        });
        it("should allow access to KPI_DASHBOARD when feature enabled", async () => {
            mockPool.query.mockResolvedValueOnce({
                rows: [
                    {
                        enabled_agents: ["OPS_AGENT", "FINANCE_AGENT"],
                        enabled_features: [
                            "CONVERSATIONS",
                            "ORDERS",
                            "CATALOG",
                            "KPI_DASHBOARD",
                        ],
                    },
                ],
            });
            jest.spyOn(reflector, "getAllAndOverride").mockImplementation((key) => {
                if (key === entitlement_guard_1.REQUIRES_FEATURE_KEY)
                    return "KPI_DASHBOARD";
                return undefined;
            });
            const context = createMockContext("pro-merchant");
            const result = await guard.canActivate(context);
            expect(result).toBe(true);
        });
    });
    describe("Inventory Agent Feature Gating", () => {
        it("should return 403 when merchant lacks INVENTORY_AGENT", async () => {
            mockPool.query.mockResolvedValueOnce({
                rows: [
                    {
                        enabled_agents: ["OPS_AGENT"], // No INVENTORY_AGENT
                        enabled_features: [
                            "CONVERSATIONS",
                            "ORDERS",
                            "CATALOG",
                            "INVENTORY",
                        ],
                    },
                ],
            });
            jest.spyOn(reflector, "getAllAndOverride").mockImplementation((key) => {
                if (key === entitlement_guard_1.REQUIRES_AGENT_KEY)
                    return "INVENTORY_AGENT";
                if (key === entitlement_guard_1.REQUIRES_FEATURE_KEY)
                    return "INVENTORY";
                return undefined;
            });
            const context = createMockContext("test-merchant");
            await expect(guard.canActivate(context)).rejects.toThrow(common_1.ForbiddenException);
        });
    });
});
