import { Test, TestingModule } from "@nestjs/testing";
import { ExecutionContext, ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Pool } from "pg";
import {
  EntitlementGuard,
  RequiresFeature,
  RequiresAgent,
  REQUIRES_FEATURE_KEY,
  REQUIRES_AGENT_KEY,
} from "../../src/shared/guards/entitlement.guard";
import { DATABASE_POOL } from "../../src/infrastructure/database/database.module";
import { AgentType, FeatureType } from "../../src/shared/entitlements";

// Mock Pool for database queries
const mockPool = {
  query: jest.fn(),
};

describe("Feature Gating - EntitlementGuard", () => {
  let guard: EntitlementGuard;
  let reflector: Reflector;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EntitlementGuard,
        Reflector,
        { provide: DATABASE_POOL, useValue: mockPool },
      ],
    }).compile();

    guard = module.get<EntitlementGuard>(EntitlementGuard);
    reflector = module.get<Reflector>(Reflector);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const createMockContext = (merchantId: string) => {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ merchantId }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;
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
          if (key === REQUIRES_FEATURE_KEY)
            return "CONVERSATIONS" as FeatureType;
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
          if (key === REQUIRES_FEATURE_KEY)
            return "CONVERSATIONS" as FeatureType;
          return undefined;
        });

        const context = createMockContext("test-merchant");

        await expect(guard.canActivate(context)).rejects.toThrow(
          ForbiddenException,
        );
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
          if (key === REQUIRES_FEATURE_KEY) return "ORDERS" as FeatureType;
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
          if (key === REQUIRES_FEATURE_KEY) return "ORDERS" as FeatureType;
          return undefined;
        });

        const context = createMockContext("test-merchant");

        await expect(guard.canActivate(context)).rejects.toThrow(
          ForbiddenException,
        );
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
          if (key === REQUIRES_FEATURE_KEY) return "CATALOG" as FeatureType;
          return undefined;
        });

        const context = createMockContext("test-merchant");

        await expect(guard.canActivate(context)).rejects.toThrow(
          ForbiddenException,
        );
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
          if (key === REQUIRES_FEATURE_KEY) return "REPORTS" as FeatureType;
          return undefined;
        });

        const context = createMockContext("test-merchant");

        await expect(guard.canActivate(context)).rejects.toThrow(
          ForbiddenException,
        );
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
          if (key === REQUIRES_FEATURE_KEY) return "REPORTS" as FeatureType;
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
          if (key === REQUIRES_FEATURE_KEY) return "VOICE_NOTES" as FeatureType;
          return undefined;
        });

        const context = createMockContext("test-merchant");

        await expect(guard.canActivate(context)).rejects.toThrow(
          ForbiddenException,
        );
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
          if (key === REQUIRES_FEATURE_KEY) return "LOYALTY" as FeatureType;
          if (key === REQUIRES_AGENT_KEY) return "MARKETING_AGENT" as AgentType;
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
          if (key === REQUIRES_FEATURE_KEY) return "LOYALTY" as FeatureType;
          if (key === REQUIRES_AGENT_KEY) return "MARKETING_AGENT" as AgentType;
          return undefined;
        });

        const context = createMockContext("test-merchant");

        await expect(guard.canActivate(context)).rejects.toThrow(
          ForbiddenException,
        );
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
          if (key === REQUIRES_AGENT_KEY) return "MARKETING_AGENT" as AgentType;
          if (key === REQUIRES_FEATURE_KEY) return "LOYALTY" as FeatureType;
          return undefined;
        });

        const context = createMockContext("test-merchant");

        await expect(guard.canActivate(context)).rejects.toThrow(
          ForbiddenException,
        );
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
          if (key === REQUIRES_FEATURE_KEY) return "LOYALTY" as FeatureType;
          if (key === REQUIRES_AGENT_KEY) return "MARKETING_AGENT" as AgentType;
          return undefined;
        });

        const context = createMockContext("starter-merchant");

        await expect(guard.canActivate(context)).rejects.toThrow(
          ForbiddenException,
        );
      });
    });
  });

  describe("General Guard Behavior", () => {
    it("should return 403 for inactive merchant", async () => {
      mockPool.query.mockResolvedValue({ rows: [] }); // No merchant found

      jest.spyOn(reflector, "getAllAndOverride").mockImplementation((key) => {
        if (key === REQUIRES_FEATURE_KEY) return "ORDERS" as FeatureType;
        return undefined;
      });

      const context = createMockContext("inactive-merchant");

      await expect(guard.canActivate(context)).rejects.toThrow(
        ForbiddenException,
      );
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
        if (key === REQUIRES_FEATURE_KEY) return "ORDERS" as FeatureType;
        return undefined;
      });

      const context = {
        switchToHttp: () => ({
          getRequest: () => ({}), // No merchantId
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext;

      await expect(guard.canActivate(context)).rejects.toThrow(
        ForbiddenException,
      );
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
        if (key === REQUIRES_FEATURE_KEY) return "CONVERSATIONS" as FeatureType;
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
        if (key === REQUIRES_FEATURE_KEY) return "PAYMENTS" as FeatureType;
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
        if (key === REQUIRES_FEATURE_KEY) return "PAYMENTS" as FeatureType;
        return undefined;
      });

      const context = createMockContext("basic-merchant");

      await expect(guard.canActivate(context)).rejects.toThrow(
        ForbiddenException,
      );
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
        if (key === REQUIRES_FEATURE_KEY) return "KPI_DASHBOARD" as FeatureType;
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
        if (key === REQUIRES_AGENT_KEY) return "INVENTORY_AGENT" as AgentType;
        if (key === REQUIRES_FEATURE_KEY) return "INVENTORY" as FeatureType;
        return undefined;
      });

      const context = createMockContext("test-merchant");

      await expect(guard.canActivate(context)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
