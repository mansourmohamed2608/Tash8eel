/**
 * Role-Based Access Control (RBAC) Guards
 *
 * Provides @Roles() decorator and RolesGuard for endpoint-level authorization.
 * Works with MerchantApiKeyGuard which extracts staffRole from JWT.
 */

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  SetMetadata,
  ForbiddenException,
  Logger,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";

// Role hierarchy: OWNER > ADMIN > MANAGER > AGENT > CASHIER > VIEWER
export type StaffRole =
  | "OWNER"
  | "ADMIN"
  | "MANAGER"
  | "AGENT"
  | "CASHIER"
  | "VIEWER";

export const ROLE_HIERARCHY: Record<StaffRole, number> = {
  OWNER: 100,
  ADMIN: 80,
  MANAGER: 60,
  AGENT: 40,
  CASHIER: 30,
  VIEWER: 20,
};

export const ROLES_KEY = "roles";

/**
 * Decorator to specify minimum required role(s) for an endpoint.
 * @param roles - One or more roles that are allowed to access the endpoint
 *
 * @example
 * // Only OWNER can access
 * @Roles('OWNER')
 *
 * @example
 * // OWNER or ADMIN can access
 * @Roles('OWNER', 'ADMIN')
 *
 * @example
 * // Anyone with MANAGER role or higher can access
 * @RequireRole('MANAGER') // Uses hierarchy
 */
export const Roles = (...roles: StaffRole[]) => SetMetadata(ROLES_KEY, roles);

export const REQUIRE_ROLE_KEY = "require_role";

/**
 * Decorator to specify minimum role level using hierarchy.
 * Any role at or above this level can access.
 *
 * @example
 * @RequireRole('MANAGER') // OWNER, ADMIN, MANAGER can access
 */
export const RequireRole = (minRole: StaffRole) =>
  SetMetadata(REQUIRE_ROLE_KEY, minRole);

/**
 * Guard that checks if the current user has one of the required roles.
 * Must be used after MerchantApiKeyGuard which sets req.staffRole.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  private readonly logger = new Logger(RolesGuard.name);

  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Check for explicit roles requirement
    const requiredRoles = this.reflector.getAllAndOverride<StaffRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // Check for minimum role requirement (hierarchy-based)
    const minRole = this.reflector.getAllAndOverride<StaffRole>(
      REQUIRE_ROLE_KEY,
      [context.getHandler(), context.getClass()],
    );

    // If no role requirements, allow access
    if (!requiredRoles && !minRole) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const userRole: StaffRole | undefined = request.staffRole;

    // If no role on request, deny access
    if (!userRole) {
      this.logger.warn({
        msg: "No staff role found on request",
        path: request.url,
        method: request.method,
      });
      throw new ForbiddenException("Access denied: No role assigned");
    }

    // Check hierarchy-based requirement
    if (minRole) {
      const userLevel = ROLE_HIERARCHY[userRole] || 0;
      const requiredLevel = ROLE_HIERARCHY[minRole] || 0;

      if (userLevel < requiredLevel) {
        this.logger.warn({
          msg: "Insufficient role level",
          userRole,
          minRole,
          path: request.url,
        });
        throw new ForbiddenException(
          `Access denied: Requires ${minRole} role or higher`,
        );
      }
      return true;
    }

    // Check explicit roles list
    if (requiredRoles && !requiredRoles.includes(userRole)) {
      this.logger.warn({
        msg: "Role not in allowed list",
        userRole,
        requiredRoles,
        path: request.url,
      });
      throw new ForbiddenException(
        `Access denied: Requires one of [${requiredRoles.join(", ")}] role`,
      );
    }

    return true;
  }
}

/**
 * Special guard for finance-related actions.
 * Requires OWNER role OR ADMIN with explicit finance permission.
 */
@Injectable()
export class FinanceActionGuard implements CanActivate {
  private readonly logger = new Logger(FinanceActionGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const userRole: StaffRole | undefined = request.staffRole;
    const permissions: string[] = request.staffPermissions || [];

    if (!userRole) {
      throw new ForbiddenException("Access denied: No role assigned");
    }

    // OWNER always has access
    if (userRole === "OWNER") {
      return true;
    }

    // Check for explicit finance permission
    const hasFinancePermission =
      permissions.includes("finance.approve") ||
      permissions.includes("finance.all") ||
      permissions.includes("payments.approve");

    if (!hasFinancePermission) {
      this.logger.warn({
        msg: "Finance action denied - insufficient permissions",
        userRole,
        permissions,
        path: request.url,
      });
      throw new ForbiddenException(
        "Access denied: Finance actions require OWNER role or explicit finance permission",
      );
    }

    return true;
  }
}

/**
 * Guard for destructive actions (delete, cancel, bulk edit).
 * Requires confirmation token or re-authentication.
 */
@Injectable()
export class DestructiveActionGuard implements CanActivate {
  private readonly logger = new Logger(DestructiveActionGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const userRole: StaffRole | undefined = request.staffRole;

    // Check for confirmation header or body field
    const confirmationToken =
      request.headers["x-confirm-action"] || request.body?.confirmationToken;

    if (!userRole) {
      throw new ForbiddenException("Access denied: No role assigned");
    }

    // VIEWER, AGENT, and CASHIER cannot perform destructive actions
    if (
      userRole === "VIEWER" ||
      userRole === "AGENT" ||
      userRole === "CASHIER"
    ) {
      throw new ForbiddenException(
        "Access denied: Insufficient role for destructive actions",
      );
    }

    // For MANAGER role, require confirmation token
    if (userRole === "MANAGER" && !confirmationToken) {
      this.logger.warn({
        msg: "Destructive action by MANAGER requires confirmation",
        path: request.url,
      });
      throw new ForbiddenException(
        "Destructive action requires confirmation. Please use the confirmation dialog.",
      );
    }

    return true;
  }
}

/**
 * Permission-based decorator for fine-grained access control.
 * @param permissions - Required permission strings
 *
 * @example
 * @RequirePermissions('orders.create', 'orders.update')
 */
export const PERMISSIONS_KEY = "permissions";
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

/**
 * Guard that checks for specific permissions.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  private readonly logger = new Logger(PermissionsGuard.name);

  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const userRole: StaffRole | undefined = request.staffRole;
    const userPermissions: string[] = request.staffPermissions || [];

    // OWNER has all permissions
    if (userRole === "OWNER") {
      return true;
    }

    // Check if user has all required permissions
    const missingPermissions = requiredPermissions.filter(
      (perm) =>
        !userPermissions.includes(perm) && !userPermissions.includes("*"),
    );

    if (missingPermissions.length > 0) {
      this.logger.warn({
        msg: "Missing required permissions",
        required: requiredPermissions,
        missing: missingPermissions,
        userPermissions,
        path: request.url,
      });
      throw new ForbiddenException(
        `Access denied: Missing permissions [${missingPermissions.join(", ")}]`,
      );
    }

    return true;
  }
}
