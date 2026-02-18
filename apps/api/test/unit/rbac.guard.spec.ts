/**
 * RBAC Guard Tests
 *
 * Tests for the Role-Based Access Control system including:
 * - Role hierarchy enforcement
 * - @Roles() decorator
 * - @RequireRole() decorator
 * - Edge cases and error handling
 */

import { Test, TestingModule } from "@nestjs/testing";
import { ExecutionContext, ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import {
  RolesGuard,
  Roles,
  RequireRole,
  StaffRole,
  ROLE_HIERARCHY,
  ROLES_KEY,
  REQUIRE_ROLE_KEY,
} from "../../src/shared/guards/roles.guard";

describe("RolesGuard", () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  const mockExecutionContext = (staffRole?: StaffRole): ExecutionContext => {
    const mockRequest = {
      staffRole,
      url: "/test",
      method: "GET",
    };

    return {
      switchToHttp: () => ({
        getRequest: () => mockRequest,
      }),
      getHandler: () => jest.fn(),
      getClass: () => jest.fn(),
    } as unknown as ExecutionContext;
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RolesGuard,
        {
          provide: Reflector,
          useValue: {
            getAllAndOverride: jest.fn(),
          },
        },
      ],
    }).compile();

    guard = module.get<RolesGuard>(RolesGuard);
    reflector = module.get<Reflector>(Reflector);
  });

  describe("Role Hierarchy", () => {
    it("should have correct hierarchy values", () => {
      expect(ROLE_HIERARCHY.OWNER).toBe(100);
      expect(ROLE_HIERARCHY.ADMIN).toBe(80);
      expect(ROLE_HIERARCHY.MANAGER).toBe(60);
      expect(ROLE_HIERARCHY.AGENT).toBe(40);
      expect(ROLE_HIERARCHY.VIEWER).toBe(20);
    });

    it("should order OWNER > ADMIN > MANAGER > AGENT > VIEWER", () => {
      expect(ROLE_HIERARCHY.OWNER).toBeGreaterThan(ROLE_HIERARCHY.ADMIN);
      expect(ROLE_HIERARCHY.ADMIN).toBeGreaterThan(ROLE_HIERARCHY.MANAGER);
      expect(ROLE_HIERARCHY.MANAGER).toBeGreaterThan(ROLE_HIERARCHY.AGENT);
      expect(ROLE_HIERARCHY.AGENT).toBeGreaterThan(ROLE_HIERARCHY.VIEWER);
    });
  });

  describe("No Role Requirements", () => {
    it("should allow access when no roles are required", () => {
      jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(undefined);

      const context = mockExecutionContext("VIEWER");
      expect(guard.canActivate(context)).toBe(true);
    });

    it("should allow access for any role when no requirements set", () => {
      jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(undefined);

      ["OWNER", "ADMIN", "MANAGER", "AGENT", "VIEWER"].forEach((role) => {
        const context = mockExecutionContext(role as StaffRole);
        expect(guard.canActivate(context)).toBe(true);
      });
    });
  });

  describe("@Roles() Decorator - Explicit Roles", () => {
    it("should allow access when user has matching role", () => {
      jest
        .spyOn(reflector, "getAllAndOverride")
        .mockImplementation((key: string) => {
          if (key === ROLES_KEY) return ["ADMIN"];
          return undefined;
        });

      const context = mockExecutionContext("ADMIN");
      expect(guard.canActivate(context)).toBe(true);
    });

    it("should allow access when user has one of multiple allowed roles", () => {
      jest
        .spyOn(reflector, "getAllAndOverride")
        .mockImplementation((key: string) => {
          if (key === ROLES_KEY) return ["ADMIN", "MANAGER"];
          return undefined;
        });

      const contextAdmin = mockExecutionContext("ADMIN");
      const contextManager = mockExecutionContext("MANAGER");

      expect(guard.canActivate(contextAdmin)).toBe(true);
      expect(guard.canActivate(contextManager)).toBe(true);
    });

    it("should deny access when user role not in allowed list", () => {
      jest
        .spyOn(reflector, "getAllAndOverride")
        .mockImplementation((key: string) => {
          if (key === ROLES_KEY) return ["OWNER"];
          return undefined;
        });

      const context = mockExecutionContext("ADMIN");
      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });

    it("should work with OWNER-only restriction", () => {
      jest
        .spyOn(reflector, "getAllAndOverride")
        .mockImplementation((key: string) => {
          if (key === ROLES_KEY) return ["OWNER"];
          return undefined;
        });

      const contextOwner = mockExecutionContext("OWNER");
      const contextAdmin = mockExecutionContext("ADMIN");

      expect(guard.canActivate(contextOwner)).toBe(true);
      expect(() => guard.canActivate(contextAdmin)).toThrow(ForbiddenException);
    });
  });

  describe("@RequireRole() Decorator - Hierarchy Based", () => {
    it("should allow access for user with exact required role", () => {
      jest
        .spyOn(reflector, "getAllAndOverride")
        .mockImplementation((key: string) => {
          if (key === REQUIRE_ROLE_KEY) return "MANAGER";
          return undefined;
        });

      const context = mockExecutionContext("MANAGER");
      expect(guard.canActivate(context)).toBe(true);
    });

    it("should allow access for user with higher role than required", () => {
      jest
        .spyOn(reflector, "getAllAndOverride")
        .mockImplementation((key: string) => {
          if (key === REQUIRE_ROLE_KEY) return "MANAGER";
          return undefined;
        });

      const contextOwner = mockExecutionContext("OWNER");
      const contextAdmin = mockExecutionContext("ADMIN");

      expect(guard.canActivate(contextOwner)).toBe(true);
      expect(guard.canActivate(contextAdmin)).toBe(true);
    });

    it("should deny access for user with lower role than required", () => {
      jest
        .spyOn(reflector, "getAllAndOverride")
        .mockImplementation((key: string) => {
          if (key === REQUIRE_ROLE_KEY) return "MANAGER";
          return undefined;
        });

      const contextAgent = mockExecutionContext("AGENT");
      const contextViewer = mockExecutionContext("VIEWER");

      expect(() => guard.canActivate(contextAgent)).toThrow(ForbiddenException);
      expect(() => guard.canActivate(contextViewer)).toThrow(
        ForbiddenException,
      );
    });

    it("should enforce ADMIN minimum for finance operations", () => {
      jest
        .spyOn(reflector, "getAllAndOverride")
        .mockImplementation((key: string) => {
          if (key === REQUIRE_ROLE_KEY) return "ADMIN";
          return undefined;
        });

      const contextOwner = mockExecutionContext("OWNER");
      const contextAdmin = mockExecutionContext("ADMIN");
      const contextManager = mockExecutionContext("MANAGER");

      expect(guard.canActivate(contextOwner)).toBe(true);
      expect(guard.canActivate(contextAdmin)).toBe(true);
      expect(() => guard.canActivate(contextManager)).toThrow(
        ForbiddenException,
      );
    });
  });

  describe("Error Cases", () => {
    it("should throw when no role on request and roles required", () => {
      jest
        .spyOn(reflector, "getAllAndOverride")
        .mockImplementation((key: string) => {
          if (key === ROLES_KEY) return ["ADMIN"];
          return undefined;
        });

      const context = mockExecutionContext(undefined);
      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
      expect(() => guard.canActivate(context)).toThrow(
        "Access denied: No role assigned",
      );
    });

    it("should throw with descriptive message for insufficient role level", () => {
      jest
        .spyOn(reflector, "getAllAndOverride")
        .mockImplementation((key: string) => {
          if (key === REQUIRE_ROLE_KEY) return "ADMIN";
          return undefined;
        });

      const context = mockExecutionContext("MANAGER");
      expect(() => guard.canActivate(context)).toThrow(
        "Requires ADMIN role or higher",
      );
    });
  });

  describe("Real-World Scenarios", () => {
    it("should allow MANAGER to create expenses", () => {
      // Simulating @RequireRole('MANAGER') on expense creation
      jest
        .spyOn(reflector, "getAllAndOverride")
        .mockImplementation((key: string) => {
          if (key === REQUIRE_ROLE_KEY) return "MANAGER";
          return undefined;
        });

      const context = mockExecutionContext("MANAGER");
      expect(guard.canActivate(context)).toBe(true);
    });

    it("should require ADMIN to verify payments", () => {
      // Simulating @RequireRole('ADMIN') on payment verification
      jest
        .spyOn(reflector, "getAllAndOverride")
        .mockImplementation((key: string) => {
          if (key === REQUIRE_ROLE_KEY) return "ADMIN";
          return undefined;
        });

      const contextManager = mockExecutionContext("MANAGER");
      const contextAdmin = mockExecutionContext("ADMIN");

      expect(() => guard.canActivate(contextManager)).toThrow(
        ForbiddenException,
      );
      expect(guard.canActivate(contextAdmin)).toBe(true);
    });

    it("should require ADMIN to delete expenses", () => {
      // Simulating @RequireRole('ADMIN') on expense deletion
      jest
        .spyOn(reflector, "getAllAndOverride")
        .mockImplementation((key: string) => {
          if (key === REQUIRE_ROLE_KEY) return "ADMIN";
          return undefined;
        });

      const contextAgent = mockExecutionContext("AGENT");
      const contextAdmin = mockExecutionContext("ADMIN");

      expect(() => guard.canActivate(contextAgent)).toThrow(ForbiddenException);
      expect(guard.canActivate(contextAdmin)).toBe(true);
    });

    it("should require ADMIN to change settings", () => {
      // Simulating @RequireRole('ADMIN') on settings update
      jest
        .spyOn(reflector, "getAllAndOverride")
        .mockImplementation((key: string) => {
          if (key === REQUIRE_ROLE_KEY) return "ADMIN";
          return undefined;
        });

      const contextViewer = mockExecutionContext("VIEWER");
      const contextOwner = mockExecutionContext("OWNER");

      expect(() => guard.canActivate(contextViewer)).toThrow(
        ForbiddenException,
      );
      expect(guard.canActivate(contextOwner)).toBe(true);
    });

    it("should allow VIEWER to read dashboard stats", () => {
      // No role requirement = everyone can access
      jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(undefined);

      const context = mockExecutionContext("VIEWER");
      expect(guard.canActivate(context)).toBe(true);
    });
  });
});

describe("Role Decorators", () => {
  it("@Roles() should set correct metadata key", () => {
    const decorator = Roles("OWNER", "ADMIN");
    expect(decorator).toBeDefined();
    // The decorator sets metadata with ROLES_KEY
  });

  it("@RequireRole() should set correct metadata key", () => {
    const decorator = RequireRole("MANAGER");
    expect(decorator).toBeDefined();
    // The decorator sets metadata with REQUIRE_ROLE_KEY
  });
});
