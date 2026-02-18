import { Injectable, Inject, Logger } from "@nestjs/common";
import { Pool } from "pg";
import { DATABASE_POOL } from "../../infrastructure/database/database.module";
import { Request } from "express";

export type AuditAction =
  | "CREATE"
  | "UPDATE"
  | "DELETE"
  | "LOGIN"
  | "LOGOUT"
  | "LOGIN_FAILED"
  | "VIEW"
  | "EXPORT"
  | "IMPORT"
  | "API_CALL"
  | "SETTINGS_CHANGE"
  | "TAKEOVER"
  | "APPROVE"
  | "REJECT"
  | "CANCEL"
  | "AUTO_VERIFY"
  | "COPILOT_RBAC_DENIED"
  | "COPILOT_RBAC_DENIED_CONFIRM"
  | "COD_STATEMENT_IMPORTED"
  | "COD_ORDER_RECONCILED"
  | "COD_ORDER_DISPUTED"
  | "SESSION_REVOKED"
  | "ALL_SESSIONS_REVOKED"
  | "PASSWORD_CHANGE"
  | "PASSWORD_RESET"
  | "ACCOUNT_LOCKED"
  | "ACCOUNT_UNLOCKED"
  | "expense.created"
  | "expense.updated"
  | "expense.deleted";

export type AuditResource =
  | "ORDER"
  | "CONVERSATION"
  | "CUSTOMER"
  | "PRODUCT"
  | "VARIANT"
  | "MERCHANT"
  | "STAFF"
  | "WEBHOOK"
  | "SETTINGS"
  | "REPORT"
  | "API_KEY"
  | "PAYMENT_LINK"
  | "PAYMENT_PROOF"
  | "INVENTORY"
  | "copilot"
  | "expense"
  | "cod_statement_imports"
  | "CAMPAIGN"
  | "POS_INTEGRATION"
  | "DELIVERY_DRIVER";

export interface AuditLogEntry {
  merchantId: string;
  staffId?: string;
  action: AuditAction;
  resource: AuditResource;
  resourceId?: string;
  oldValues?: Record<string, any>;
  newValues?: Record<string, any>;
  metadata?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  correlationId?: string;
}

export interface AuditLogQuery {
  merchantId: string;
  staffId?: string;
  action?: AuditAction;
  resource?: AuditResource;
  resourceId?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);
  private auditResourceColumn: "resource" | "resource_type" | null | undefined;
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  private isUuid(value?: string): boolean {
    if (!value) return false;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    );
  }

  /**
   * Log an audit event
   */
  async log(entry: AuditLogEntry): Promise<void> {
    try {
      const safeStaffId = this.isUuid(entry.staffId) ? entry.staffId : null;
      const metadata = {
        ...(entry.metadata || {}),
        ...(entry.staffId && !safeStaffId ? { staffIdRaw: entry.staffId } : {}),
      };
      const resourceColumn = await this.resolveAuditResourceColumn();
      if (resourceColumn) {
        await this.pool.query(
          `INSERT INTO audit_logs (
            merchant_id, staff_id, action, ${resourceColumn}, resource_id,
            old_values, new_values, metadata, ip_address, user_agent, correlation_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            entry.merchantId,
            safeStaffId,
            entry.action,
            entry.resource,
            entry.resourceId || null,
            entry.oldValues ? JSON.stringify(entry.oldValues) : null,
            entry.newValues ? JSON.stringify(entry.newValues) : null,
            JSON.stringify(metadata),
            entry.ipAddress || null,
            entry.userAgent || null,
            entry.correlationId || null,
          ],
        );
      } else {
        await this.pool.query(
          `INSERT INTO audit_logs (
            merchant_id, staff_id, action, resource_id,
            old_values, new_values, metadata, ip_address, user_agent, correlation_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            entry.merchantId,
            safeStaffId,
            entry.action,
            entry.resourceId || null,
            entry.oldValues ? JSON.stringify(entry.oldValues) : null,
            entry.newValues ? JSON.stringify(entry.newValues) : null,
            JSON.stringify(metadata),
            entry.ipAddress || null,
            entry.userAgent || null,
            entry.correlationId || null,
          ],
        );
      }
    } catch (error) {
      // Log to console but don't throw - audit logging shouldn't break the main flow
      this.logger.error("Failed to write audit log:", error);
    }
  }

  /**
   * Log from an HTTP request context
   */
  async logFromRequest(
    req: Request,
    action: AuditAction,
    resource: AuditResource,
    resourceId?: string,
    details?: {
      oldValues?: Record<string, any>;
      newValues?: Record<string, any>;
      metadata?: Record<string, any>;
    },
  ): Promise<void> {
    const merchantId = (req as any).merchantId;
    const staffId = (req as any).staffId;

    if (!merchantId) {
      this.logger.warn("Audit log attempted without merchantId");
      return;
    }

    const pagePath =
      (req.headers["x-page-path"] as string) ||
      (req.headers["referer"] as string | undefined);
    const pageName = req.headers["x-page-name"] as string | undefined;
    const pageNameB64 = req.headers["x-page-name-b64"] as string | undefined;
    let decodedPageName: string | undefined = pageName;
    if (!decodedPageName && pageNameB64) {
      try {
        decodedPageName = Buffer.from(pageNameB64, "base64").toString("utf8");
      } catch {
        decodedPageName = undefined;
      }
    }
    const mergedMetadata = {
      ...(details?.metadata || {}),
      ...(pagePath ? { pagePath } : {}),
      ...(decodedPageName ? { pageName: decodedPageName } : {}),
    };

    await this.log({
      merchantId,
      staffId,
      action,
      resource,
      resourceId,
      oldValues: details?.oldValues,
      newValues: details?.newValues,
      metadata: Object.keys(mergedMetadata).length ? mergedMetadata : undefined,
      ipAddress: this.getClientIp(req),
      userAgent: req.headers["user-agent"],
      correlationId: req.correlationId,
    });
  }

  /**
   * Query audit logs
   */
  async query(params: AuditLogQuery): Promise<{
    logs: any[];
    total: number;
  }> {
    const conditions: string[] = ["al.merchant_id = $1"];
    const values: any[] = [params.merchantId];
    let paramIndex = 2;

    if (params.staffId) {
      const safeStaffId = this.isUuid(params.staffId) ? params.staffId : null;
      if (safeStaffId) {
        conditions.push(`al.staff_id = $${paramIndex++}`);
        values.push(safeStaffId);
      } else if (params.staffId === "api" || params.staffId === "system") {
        conditions.push(`al.staff_id IS NULL`);
      }
    }

    if (params.action) {
      conditions.push(`al.action = $${paramIndex++}`);
      values.push(params.action);
    }

    const resourceColumn = await this.resolveAuditResourceColumn();
    if (params.resource && resourceColumn) {
      conditions.push(`al.${resourceColumn} = $${paramIndex++}`);
      values.push(params.resource);
    }

    if (params.resourceId) {
      conditions.push(`al.resource_id = $${paramIndex++}`);
      values.push(params.resourceId);
    }

    if (params.startDate) {
      conditions.push(`al.created_at >= $${paramIndex++}`);
      values.push(params.startDate);
    }

    if (params.endDate) {
      conditions.push(`al.created_at <= $${paramIndex++}`);
      values.push(params.endDate);
    }

    const whereClause = conditions.join(" AND ");
    const limit = Math.min(params.limit || 50, 200);
    const offset = params.offset || 0;

    // Get total count
    const countResult = await this.pool.query(
      `SELECT COUNT(*) FROM audit_logs al WHERE ${whereClause}`,
      values,
    );

    // Get logs
    const logsResult = await this.pool.query(
      `SELECT 
        al.*,
        ms.name as staff_name,
        ms.email as staff_email
       FROM audit_logs al
       LEFT JOIN merchant_staff ms ON al.staff_id = ms.id
       WHERE ${whereClause}
       ORDER BY al.created_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      [...values, limit, offset],
    );

    return {
      logs: logsResult.rows.map((row) => ({
        id: row.id,
        merchantId: row.merchant_id,
        staffId: row.staff_id,
        staffName: row.staff_name,
        staffEmail: row.staff_email,
        action: row.action,
        resource: row.resource || row.resource_type,
        resourceId: row.resource_id,
        oldValues: row.old_values,
        newValues: row.new_values,
        metadata: row.metadata,
        ipAddress: row.ip_address,
        userAgent: row.user_agent,
        correlationId: row.correlation_id,
        createdAt: row.created_at,
      })),
      total: parseInt(countResult.rows[0].count),
    };
  }

  /**
   * Get audit log for a specific resource
   */
  async getResourceHistory(
    merchantId: string,
    resource: AuditResource,
    resourceId: string,
    limit: number = 50,
  ): Promise<any[]> {
    const resourceColumn = await this.resolveAuditResourceColumn();
    if (!resourceColumn) return [];

    const result = await this.pool.query(
      `SELECT 
        al.*,
        ms.name as staff_name,
        ms.email as staff_email
       FROM audit_logs al
       LEFT JOIN merchant_staff ms ON al.staff_id = ms.id
       WHERE al.merchant_id = $1 AND al.${resourceColumn} = $2 AND al.resource_id = $3
       ORDER BY al.created_at DESC
       LIMIT $4`,
      [merchantId, resource, resourceId, limit],
    );

    return result.rows.map((row) => ({
      id: row.id,
      action: row.action,
      staffName: row.staff_name || "API",
      oldValues: row.old_values,
      newValues: row.new_values,
      metadata: row.metadata,
      createdAt: row.created_at,
    }));
  }

  /**
   * Get activity summary for a merchant
   */
  async getActivitySummary(
    merchantId: string,
    days: number = 7,
  ): Promise<{
    totalActions: number;
    byAction: Record<string, number>;
    byResource: Record<string, number>;
    byStaff: Array<{ staffId: string; name: string; count: number }>;
    timeline: Array<{ date: string; count: number }>;
  }> {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Get totals by action
    const actionResult = await this.pool.query(
      `SELECT action, COUNT(*) as count 
       FROM audit_logs 
       WHERE merchant_id = $1 AND created_at >= $2
       GROUP BY action`,
      [merchantId, startDate],
    );

    // Get totals by resource
    const resourceColumn = await this.resolveAuditResourceColumn();
    let resourceResult = {
      rows: [] as Array<{ resource?: string; count: string }>,
    };
    if (resourceColumn) {
      resourceResult = await this.pool.query(
        `SELECT ${resourceColumn} as resource, COUNT(*) as count 
         FROM audit_logs 
         WHERE merchant_id = $1 AND created_at >= $2
         GROUP BY ${resourceColumn}`,
        [merchantId, startDate],
      );
    }

    // Get totals by staff
    const staffResult = await this.pool.query(
      `SELECT al.staff_id, ms.name, COUNT(*) as count 
       FROM audit_logs al
       LEFT JOIN merchant_staff ms ON al.staff_id = ms.id
       WHERE al.merchant_id = $1 AND al.created_at >= $2
       GROUP BY al.staff_id, ms.name
       ORDER BY count DESC
       LIMIT 10`,
      [merchantId, startDate],
    );

    // Get daily timeline
    const timelineResult = await this.pool.query(
      `SELECT DATE(created_at) as date, COUNT(*) as count 
       FROM audit_logs 
       WHERE merchant_id = $1 AND created_at >= $2
       GROUP BY DATE(created_at)
       ORDER BY date`,
      [merchantId, startDate],
    );

    const byAction: Record<string, number> = {};
    actionResult.rows.forEach((r) => {
      byAction[r.action] = parseInt(r.count);
    });

    const byResource: Record<string, number> = {};
    resourceResult.rows.forEach((r) => {
      if (r.resource) byResource[r.resource] = parseInt(r.count);
    });

    return {
      totalActions: Object.values(byAction).reduce((a, b) => a + b, 0),
      byAction,
      byResource,
      byStaff: staffResult.rows.map((r) => ({
        staffId: r.staff_id || "api",
        name: r.name || "API Key",
        count: parseInt(r.count),
      })),
      timeline: timelineResult.rows.map((r) => ({
        date: r.date.toISOString().split("T")[0],
        count: parseInt(r.count),
      })),
    };
  }

  /**
   * Clean up old audit logs
   */
  async cleanup(daysToKeep: number = 90): Promise<number> {
    const result = await this.pool.query(
      `SELECT cleanup_old_audit_logs($1) as deleted`,
      [daysToKeep],
    );
    return result.rows[0].deleted;
  }

  private getClientIp(req: Request): string {
    const forwarded = req.headers["x-forwarded-for"];
    if (forwarded) {
      const ips = Array.isArray(forwarded) ? forwarded[0] : forwarded;
      return ips.split(",")[0].trim();
    }
    return req.ip || req.socket?.remoteAddress || "unknown";
  }

  private async resolveAuditResourceColumn(): Promise<
    "resource" | "resource_type" | null
  > {
    if (this.auditResourceColumn !== undefined) {
      return this.auditResourceColumn;
    }
    try {
      const result = await this.pool.query(
        `SELECT column_name
         FROM information_schema.columns
         WHERE table_name = 'audit_logs'
           AND column_name IN ('resource', 'resource_type')`,
      );
      const columns = result.rows.map((row: any) => row.column_name);
      if (columns.includes("resource")) {
        this.auditResourceColumn = "resource";
      } else if (columns.includes("resource_type")) {
        this.auditResourceColumn = "resource_type";
      } else {
        this.auditResourceColumn = null;
      }
    } catch {
      this.auditResourceColumn = null;
    }
    return this.auditResourceColumn;
  }
}
