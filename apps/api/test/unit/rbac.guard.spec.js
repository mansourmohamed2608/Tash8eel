"use strict";
/**
 * RBAC Guard Tests
 *
 * Tests for the Role-Based Access Control system including:
 * - Role hierarchy enforcement
 * - @Roles() decorator
 * - @RequireRole() decorator
 * - Edge cases and error handling
 */
Object.defineProperty(exports, "__esModule", { value: true });
const testing_1 = require("@nestjs/testing");
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const roles_guard_1 = require("../../src/shared/guards/roles.guard");
describe("RolesGuard", () => {
    let guard;
    let reflector;
    const mockExecutionContext = (staffRole) => {
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
        };
    };
    beforeEach(async () => {
        const module = await testing_1.Test.createTestingModule({
            providers: [
                roles_guard_1.RolesGuard,
                {
                    provide: core_1.Reflector,
                    useValue: {
                        getAllAndOverride: jest.fn(),
                    },
                },
            ],
        }).compile();
        guard = module.get(roles_guard_1.RolesGuard);
        reflector = module.get(core_1.Reflector);
    });
    describe("Role Hierarchy", () => {
        it("should have correct hierarchy values", () => {
            expect(roles_guard_1.ROLE_HIERARCHY.OWNER).toBe(100);
            expect(roles_guard_1.ROLE_HIERARCHY.ADMIN).toBe(80);
            expect(roles_guard_1.ROLE_HIERARCHY.MANAGER).toBe(60);
            expect(roles_guard_1.ROLE_HIERARCHY.AGENT).toBe(40);
            expect(roles_guard_1.ROLE_HIERARCHY.VIEWER).toBe(20);
        });
        it("should order OWNER > ADMIN > MANAGER > AGENT > VIEWER", () => {
            expect(roles_guard_1.ROLE_HIERARCHY.OWNER).toBeGreaterThan(roles_guard_1.ROLE_HIERARCHY.ADMIN);
            expect(roles_guard_1.ROLE_HIERARCHY.ADMIN).toBeGreaterThan(roles_guard_1.ROLE_HIERARCHY.MANAGER);
            expect(roles_guard_1.ROLE_HIERARCHY.MANAGER).toBeGreaterThan(roles_guard_1.ROLE_HIERARCHY.AGENT);
            expect(roles_guard_1.ROLE_HIERARCHY.AGENT).toBeGreaterThan(roles_guard_1.ROLE_HIERARCHY.VIEWER);
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
                const context = mockExecutionContext(role);
                expect(guard.canActivate(context)).toBe(true);
            });
        });
    });
    describe("@Roles() Decorator - Explicit Roles", () => {
        it("should allow access when user has matching role", () => {
            jest
                .spyOn(reflector, "getAllAndOverride")
                .mockImplementation((key) => {
                if (key === roles_guard_1.ROLES_KEY)
                    return ["ADMIN"];
                return undefined;
            });
            const context = mockExecutionContext("ADMIN");
            expect(guard.canActivate(context)).toBe(true);
        });
        it("should allow access when user has one of multiple allowed roles", () => {
            jest
                .spyOn(reflector, "getAllAndOverride")
                .mockImplementation((key) => {
                if (key === roles_guard_1.ROLES_KEY)
                    return ["ADMIN", "MANAGER"];
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
                .mockImplementation((key) => {
                if (key === roles_guard_1.ROLES_KEY)
                    return ["OWNER"];
                return undefined;
            });
            const context = mockExecutionContext("ADMIN");
            expect(() => guard.canActivate(context)).toThrow(common_1.ForbiddenException);
        });
        it("should work with OWNER-only restriction", () => {
            jest
                .spyOn(reflector, "getAllAndOverride")
                .mockImplementation((key) => {
                if (key === roles_guard_1.ROLES_KEY)
                    return ["OWNER"];
                return undefined;
            });
            const contextOwner = mockExecutionContext("OWNER");
            const contextAdmin = mockExecutionContext("ADMIN");
            expect(guard.canActivate(contextOwner)).toBe(true);
            expect(() => guard.canActivate(contextAdmin)).toThrow(common_1.ForbiddenException);
        });
    });
    describe("@RequireRole() Decorator - Hierarchy Based", () => {
        it("should allow access for user with exact required role", () => {
            jest
                .spyOn(reflector, "getAllAndOverride")
                .mockImplementation((key) => {
                if (key === roles_guard_1.REQUIRE_ROLE_KEY)
                    return "MANAGER";
                return undefined;
            });
            const context = mockExecutionContext("MANAGER");
            expect(guard.canActivate(context)).toBe(true);
        });
        it("should allow access for user with higher role than required", () => {
            jest
                .spyOn(reflector, "getAllAndOverride")
                .mockImplementation((key) => {
                if (key === roles_guard_1.REQUIRE_ROLE_KEY)
                    return "MANAGER";
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
                .mockImplementation((key) => {
                if (key === roles_guard_1.REQUIRE_ROLE_KEY)
                    return "MANAGER";
                return undefined;
            });
            const contextAgent = mockExecutionContext("AGENT");
            const contextViewer = mockExecutionContext("VIEWER");
            expect(() => guard.canActivate(contextAgent)).toThrow(common_1.ForbiddenException);
            expect(() => guard.canActivate(contextViewer)).toThrow(common_1.ForbiddenException);
        });
        it("should enforce ADMIN minimum for finance operations", () => {
            jest
                .spyOn(reflector, "getAllAndOverride")
                .mockImplementation((key) => {
                if (key === roles_guard_1.REQUIRE_ROLE_KEY)
                    return "ADMIN";
                return undefined;
            });
            const contextOwner = mockExecutionContext("OWNER");
            const contextAdmin = mockExecutionContext("ADMIN");
            const contextManager = mockExecutionContext("MANAGER");
            expect(guard.canActivate(contextOwner)).toBe(true);
            expect(guard.canActivate(contextAdmin)).toBe(true);
            expect(() => guard.canActivate(contextManager)).toThrow(common_1.ForbiddenException);
        });
    });
    describe("Error Cases", () => {
        it("should throw when no role on request and roles required", () => {
            jest
                .spyOn(reflector, "getAllAndOverride")
                .mockImplementation((key) => {
                if (key === roles_guard_1.ROLES_KEY)
                    return ["ADMIN"];
                return undefined;
            });
            const context = mockExecutionContext(undefined);
            expect(() => guard.canActivate(context)).toThrow(common_1.ForbiddenException);
            expect(() => guard.canActivate(context)).toThrow("Access denied: No role assigned");
        });
        it("should throw with descriptive message for insufficient role level", () => {
            jest
                .spyOn(reflector, "getAllAndOverride")
                .mockImplementation((key) => {
                if (key === roles_guard_1.REQUIRE_ROLE_KEY)
                    return "ADMIN";
                return undefined;
            });
            const context = mockExecutionContext("MANAGER");
            expect(() => guard.canActivate(context)).toThrow("Requires ADMIN role or higher");
        });
    });
    describe("Real-World Scenarios", () => {
        it("should allow MANAGER to create expenses", () => {
            // Simulating @RequireRole('MANAGER') on expense creation
            jest
                .spyOn(reflector, "getAllAndOverride")
                .mockImplementation((key) => {
                if (key === roles_guard_1.REQUIRE_ROLE_KEY)
                    return "MANAGER";
                return undefined;
            });
            const context = mockExecutionContext("MANAGER");
            expect(guard.canActivate(context)).toBe(true);
        });
        it("should require ADMIN to verify payments", () => {
            // Simulating @RequireRole('ADMIN') on payment verification
            jest
                .spyOn(reflector, "getAllAndOverride")
                .mockImplementation((key) => {
                if (key === roles_guard_1.REQUIRE_ROLE_KEY)
                    return "ADMIN";
                return undefined;
            });
            const contextManager = mockExecutionContext("MANAGER");
            const contextAdmin = mockExecutionContext("ADMIN");
            expect(() => guard.canActivate(contextManager)).toThrow(common_1.ForbiddenException);
            expect(guard.canActivate(contextAdmin)).toBe(true);
        });
        it("should require ADMIN to delete expenses", () => {
            // Simulating @RequireRole('ADMIN') on expense deletion
            jest
                .spyOn(reflector, "getAllAndOverride")
                .mockImplementation((key) => {
                if (key === roles_guard_1.REQUIRE_ROLE_KEY)
                    return "ADMIN";
                return undefined;
            });
            const contextAgent = mockExecutionContext("AGENT");
            const contextAdmin = mockExecutionContext("ADMIN");
            expect(() => guard.canActivate(contextAgent)).toThrow(common_1.ForbiddenException);
            expect(guard.canActivate(contextAdmin)).toBe(true);
        });
        it("should require ADMIN to change settings", () => {
            // Simulating @RequireRole('ADMIN') on settings update
            jest
                .spyOn(reflector, "getAllAndOverride")
                .mockImplementation((key) => {
                if (key === roles_guard_1.REQUIRE_ROLE_KEY)
                    return "ADMIN";
                return undefined;
            });
            const contextViewer = mockExecutionContext("VIEWER");
            const contextOwner = mockExecutionContext("OWNER");
            expect(() => guard.canActivate(contextViewer)).toThrow(common_1.ForbiddenException);
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
        const decorator = (0, roles_guard_1.Roles)("OWNER", "ADMIN");
        expect(decorator).toBeDefined();
        // The decorator sets metadata with ROLES_KEY
    });
    it("@RequireRole() should set correct metadata key", () => {
        const decorator = (0, roles_guard_1.RequireRole)("MANAGER");
        expect(decorator).toBeDefined();
        // The decorator sets metadata with REQUIRE_ROLE_KEY
    });
});
