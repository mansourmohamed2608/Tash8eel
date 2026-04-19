import {
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Inject,
  Param,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from "@nestjs/swagger";
import { Request } from "express";
import { Pool } from "pg";
import { DATABASE_POOL } from "../../infrastructure/database/database.module";
import { MerchantApiKeyGuard } from "../../shared/guards/merchant-api-key.guard";
import {
  EntitlementGuard,
  RequiresFeature,
} from "../../shared/guards/entitlement.guard";
import { RequireRole, RolesGuard } from "../../shared/guards/roles.guard";
import { AuditService } from "../../application/services/audit.service";
import { StaffService } from "../../application/services/staff.service";
import { getMerchantId } from "./portal-compat.helpers";

@ApiTags("Merchant Portal")
@ApiSecurity("api-key")
@ApiHeader({
  name: "x-api-key",
  required: true,
  description: "Merchant API key",
})
@UseGuards(MerchantApiKeyGuard, RolesGuard, EntitlementGuard)
@Controller("v1/portal")
export class PortalSecurityController {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly auditService: AuditService,
    private readonly staffService: StaffService,
  ) {}

  // ============== SECURITY ==============

  @Get("security/sessions")
  @ApiOperation({ summary: "Get active sessions for current staff member" })
  @ApiResponse({ status: 200, description: "Sessions retrieved" })
  async getSessions(@Req() req: Request): Promise<any> {
    const staffId = (req as any).staffId;
    if (!staffId) {
      // If accessed via API key without staff context, return empty
      return { sessions: [] };
    }

    // Validate staffId is a valid UUID before querying
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(staffId)) {
      return { sessions: [] };
    }

    const sessions = await this.staffService.getSessions(staffId);

    // Mark current session
    const currentSessionId = (req as any).sessionId;

    return {
      sessions: sessions.map((session) => ({
        ...session,
        isCurrent: session.id === currentSessionId,
      })),
    };
  }

  @RequireRole("AGENT")
  @Delete("security/sessions/:sessionId")
  @ApiOperation({ summary: "Revoke a specific session" })
  @ApiParam({ name: "sessionId", description: "Session ID to revoke" })
  @ApiResponse({ status: 200, description: "Session revoked" })
  async revokeSession(
    @Req() req: Request,
    @Param("sessionId") sessionId: string,
  ): Promise<any> {
    const staffId = (req as any).staffId;
    if (!staffId) {
      throw new ForbiddenException("Staff authentication required");
    }

    await this.staffService.revokeSession(staffId, sessionId);

    await this.auditService.log({
      merchantId: getMerchantId(req),
      staffId,
      action: "SESSION_REVOKED",
      resource: "STAFF",
      resourceId: staffId,
      metadata: { sessionId },
    });

    return { success: true };
  }

  @RequireRole("AGENT")
  @Delete("security/sessions")
  @ApiOperation({ summary: "Revoke all sessions except current" })
  @ApiResponse({ status: 200, description: "All sessions revoked" })
  async revokeAllSessions(@Req() req: Request): Promise<any> {
    const staffId = (req as any).staffId;
    if (!staffId) {
      throw new ForbiddenException("Staff authentication required");
    }

    const currentSessionId = (req as any).sessionId;
    const sessions = await this.staffService.getSessions(staffId);

    let revoked = 0;
    for (const session of sessions) {
      if (session.id !== currentSessionId) {
        await this.staffService.revokeSession(staffId, session.id);
        revoked++;
      }
    }

    await this.auditService.log({
      merchantId: getMerchantId(req),
      staffId,
      action: "ALL_SESSIONS_REVOKED",
      resource: "STAFF",
      resourceId: staffId,
      metadata: { revoked, kept: currentSessionId },
    });

    return { success: true, revoked };
  }

  @RequireRole("OWNER")
  @Delete("sessions/all")
  @ApiOperation({ summary: "Revoke all sessions for this merchant" })
  @ApiResponse({ status: 200, description: "Merchant sessions revoked" })
  async revokeAllMerchantSessions(@Req() req: Request): Promise<any> {
    const merchantId = getMerchantId(req);
    const staffId = (req as any).staffId;
    const revoked =
      await this.staffService.revokeAllMerchantSessions(merchantId);

    await this.auditService.log({
      merchantId,
      staffId,
      action: "ALL_SESSIONS_REVOKED",
      resource: "MERCHANT",
      resourceId: merchantId,
      metadata: { scope: "merchant", revoked },
    });

    return { success: true, revoked };
  }

  @Get("security/audit")
  @RequiresFeature("AUDIT_LOGS")
  @ApiOperation({ summary: "Get security audit logs for current user" })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiQuery({ name: "offset", required: false, type: Number })
  @ApiResponse({ status: 200, description: "Audit logs retrieved" })
  async getSecurityAudit(
    @Req() req: Request,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ): Promise<any> {
    const merchantId = getMerchantId(req);
    const staffId = (req as any).staffId;
    const parsedLimit = Math.min(Number(limit) || 50, 200);
    const parsedOffset = Number(offset) || 0;

    // Validate staffId is a valid UUID, otherwise set to null for query
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const safeStaffId = staffId && uuidRegex.test(staffId) ? staffId : null;

    // Get security-relevant audit entries
    try {
      const result = await this.pool.query(
        `SELECT id, action, resource, resource_id, ip_address, user_agent, created_at, metadata
         FROM audit_logs
         WHERE merchant_id = $1
           AND ($2::uuid IS NULL OR staff_id = $2)
           AND action IN ('LOGIN', 'LOGOUT', 'PASSWORD_CHANGED', 'SESSION_REVOKED', 'ALL_SESSIONS_REVOKED', 'API_KEY_ROTATED', 'PERMISSIONS_CHANGED')
         ORDER BY created_at DESC
         LIMIT $3 OFFSET $4`,
        [merchantId, safeStaffId, parsedLimit, parsedOffset],
      );

      return {
        logs: result.rows.map((row) => ({
          id: row.id,
          action: row.action,
          resource: row.resource,
          resourceId: row.resource_id,
          ipAddress: row.ip_address,
          userAgent: row.user_agent,
          createdAt: row.created_at,
          metadata: row.metadata,
        })),
      };
    } catch (err: any) {
      // Handle case where audit_logs table or resource column doesn't exist (migration 008 not run)
      if (err?.message?.includes("does not exist")) {
        return { logs: [] };
      }
      throw err;
    }
  }
}
