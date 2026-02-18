import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Req,
  Res,
  UseGuards,
  HttpStatus,
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
  ForbiddenException,
  UseInterceptors,
  UploadedFile,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import {
  ApiTags,
  ApiOperation,
  ApiHeader,
  ApiQuery,
  ApiBody,
  ApiParam,
  ApiConsumes,
  ApiSecurity,
} from "@nestjs/swagger";
import { Request, Response } from "express";
import { MerchantApiKeyGuard } from "../../shared/guards/merchant-api-key.guard";
import {
  EntitlementGuard,
  RequiresFeature,
} from "../../shared/guards/entitlement.guard";
import {
  RolesGuard,
  Roles,
  RequireRole,
  StaffRole,
} from "../../shared/guards/roles.guard";
import {
  AuditService,
  AuditAction,
  AuditResource,
} from "../../application/services/audit.service";
import {
  WebhookService,
  WebhookEvent,
} from "../../application/services/webhook.service";
import * as net from "net";
import { StaffService } from "../../application/services/staff.service";
import { BulkOperationsService } from "../../application/services/bulk-operations.service";
import {
  RateLimitService,
  RateLimit,
  EnhancedRateLimitGuard,
} from "../../shared/guards/rate-limit.guard";

@ApiTags("Production Features")
@Controller("v1/portal")
@UseGuards(MerchantApiKeyGuard, RolesGuard, EntitlementGuard)
@ApiHeader({
  name: "X-API-Key",
  description: "Merchant API Key",
  required: true,
})
export class ProductionFeaturesController {
  private static readonly CSV_UPLOAD_LIMIT_BYTES = 5 * 1024 * 1024; // 5MB
  private static readonly CSV_ALLOWED_MIME_TYPES = new Set([
    "text/csv",
    "application/csv",
    "text/plain",
    "application/vnd.ms-excel",
  ]);

  private static readonly CSV_UPLOAD_OPTIONS = {
    storage: memoryStorage(),
    limits: { fileSize: ProductionFeaturesController.CSV_UPLOAD_LIMIT_BYTES },
    fileFilter: (
      _req: Request,
      file: Express.Multer.File,
      cb: (error: Error | null, acceptFile: boolean) => void,
    ) => {
      if (
        ProductionFeaturesController.CSV_ALLOWED_MIME_TYPES.has(file.mimetype)
      ) {
        cb(null, true);
        return;
      }
      cb(new BadRequestException("Invalid file type. CSV required."), false);
    },
  };

  constructor(
    private readonly auditService: AuditService,
    private readonly webhookService: WebhookService,
    private readonly staffService: StaffService,
    private readonly bulkOpsService: BulkOperationsService,
    private readonly rateLimitService: RateLimitService,
  ) {}

  private getMerchantId(req: Request): string {
    return (req as any).merchantId;
  }

  // ============== AUDIT LOGS ==============

  @Get("audit")
  @RequiresFeature("AUDIT_LOGS")
  @ApiOperation({ summary: "Get audit logs" })
  @ApiQuery({ name: "action", required: false })
  @ApiQuery({ name: "resource", required: false })
  @ApiQuery({ name: "resourceId", required: false })
  @ApiQuery({ name: "staffId", required: false })
  @ApiQuery({ name: "startDate", required: false })
  @ApiQuery({ name: "endDate", required: false })
  @ApiQuery({ name: "limit", required: false })
  @ApiQuery({ name: "offset", required: false })
  async getAuditLogs(
    @Req() req: Request,
    @Query("action") action?: AuditAction,
    @Query("resource") resource?: AuditResource,
    @Query("resourceId") resourceId?: string,
    @Query("staffId") staffId?: string,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
    @Query("limit") limit?: number,
    @Query("offset") offset?: number,
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);

    return this.auditService.query({
      merchantId,
      action,
      resource,
      resourceId,
      staffId,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      limit: limit || 50,
      offset: offset || 0,
    });
  }

  @Get("audit/export")
  @RequiresFeature("AUDIT_LOGS")
  @ApiOperation({ summary: "Export audit logs (CSV)" })
  @ApiQuery({ name: "startDate", required: false })
  @ApiQuery({ name: "endDate", required: false })
  @ApiQuery({ name: "action", required: false })
  @ApiQuery({ name: "resource", required: false })
  async exportAuditLogs(
    @Req() req: Request,
    @Res() res: Response,
    @Query("action") action?: AuditAction,
    @Query("resource") resource?: AuditResource,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
  ) {
    const merchantId = this.getMerchantId(req);
    const result = await this.auditService.query({
      merchantId,
      action,
      resource,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      limit: 1000,
      offset: 0,
    });

    const headers = [
      "id",
      "action",
      "resource",
      "resourceId",
      "staffName",
      "ipAddress",
      "correlationId",
      "pagePath",
      "pageName",
      "oldValues",
      "newValues",
      "metadata",
      "createdAt",
    ];

    const rows = result.logs.map((log) => [
      log.id,
      log.action,
      log.resource,
      log.resourceId || "",
      log.staffName || "",
      log.ipAddress || "",
      log.correlationId || "",
      log.metadata?.pagePath || "",
      log.metadata?.pageName || "",
      log.oldValues ? JSON.stringify(log.oldValues) : "",
      log.newValues ? JSON.stringify(log.newValues) : "",
      log.metadata ? JSON.stringify(log.metadata) : "",
      log.createdAt || "",
    ]);

    const csv = [
      headers.join(","),
      ...rows.map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","),
      ),
    ].join("\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="audit-${merchantId}.csv"`,
    );
    res.send(csv);
  }

  @Get("audit/summary")
  @RequiresFeature("AUDIT_LOGS")
  @ApiOperation({ summary: "Get audit activity summary" })
  @ApiQuery({ name: "days", required: false })
  async getAuditSummary(
    @Req() req: Request,
    @Query("days") days?: number,
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);
    return this.auditService.getActivitySummary(merchantId, days || 7);
  }

  @Get("audit/resource/:resource/:resourceId")
  @RequiresFeature("AUDIT_LOGS")
  @ApiOperation({ summary: "Get audit history for a specific resource" })
  async getResourceAuditHistory(
    @Req() req: Request,
    @Param("resource") resource: AuditResource,
    @Param("resourceId") resourceId: string,
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);
    return this.auditService.getResourceHistory(
      merchantId,
      resource,
      resourceId,
    );
  }

  // ============== WEBHOOKS ==============

  @Get("webhooks")
  @RequiresFeature("WEBHOOKS")
  @ApiOperation({ summary: "Get all webhooks" })
  async getWebhooks(@Req() req: Request): Promise<any> {
    const merchantId = this.getMerchantId(req);
    const webhooks = await this.webhookService.findByMerchant(merchantId);
    const deliverySummary =
      await this.webhookService.getDeliverySummaryByWebhook(merchantId);

    // Don't expose full secrets
    return {
      webhooks: webhooks.map((w) => {
        const summary = deliverySummary[w.id];
        return {
          ...w,
          isActive: w.status === "ACTIVE",
          successCount: summary?.successCount || 0,
          failureCount: summary?.failureCount || 0,
          lastDeliveryAt: summary?.lastDeliveryAt || w.lastTriggeredAt,
          lastDeliveryStatus: summary?.lastDeliveryStatus,
          secret: `${w.secret.substring(0, 12)}...`,
        };
      }),
    };
  }

  @RequireRole("ADMIN")
  @RequiresFeature("WEBHOOKS")
  @Post("webhooks")
  @ApiOperation({ summary: "Create a new webhook" })
  @ApiBody({
    schema: {
      type: "object",
      required: ["name", "url", "events"],
      properties: {
        name: { type: "string" },
        url: { type: "string", format: "uri" },
        events: { type: "array", items: { type: "string" } },
        headers: { type: "object" },
        retryCount: { type: "number" },
        timeoutMs: { type: "number" },
      },
    },
  })
  async createWebhook(
    @Req() req: Request,
    @Body()
    body: {
      name: string;
      url: string;
      events: WebhookEvent[];
      headers?: Record<string, string>;
      retryCount?: number;
      timeoutMs?: number;
    },
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);

    // Validate URL (HTTPS + no private/localhost)
    this.validateWebhookUrl(body.url);

    // Validate events
    const validEvents: WebhookEvent[] = [
      "order.created",
      "order.confirmed",
      "order.shipped",
      "order.delivered",
      "order.cancelled",
      "conversation.started",
      "conversation.order_placed",
      "conversation.closed",
      "conversation.takeover",
      "customer.created",
      "customer.updated",
      "inventory.low_stock",
      "inventory.out_of_stock",
      "message.received",
      "message.sent",
    ];

    if (!Array.isArray(body.events) || body.events.length === 0) {
      throw new BadRequestException("يرجى اختيار حدث واحد على الأقل");
    }

    for (const event of body.events) {
      if (!validEvents.includes(event)) {
        throw new BadRequestException(`Invalid event type: ${event}`);
      }
    }

    // Test URL before saving
    const secret = this.webhookService.generateSecret();
    const testResult = await this.webhookService.testUrl({
      merchantId,
      url: body.url,
      secret,
      headers: body.headers,
      timeoutMs: body.timeoutMs,
    });
    if (!testResult.success) {
      throw new BadRequestException(
        "فشل اختبار الـ Webhook. تأكد من الرابط وأنه يستقبل الطلبات.",
      );
    }

    const webhook = await this.webhookService.create({
      merchantId,
      name: body.name,
      url: body.url,
      events: body.events,
      headers: body.headers,
      retryCount: body.retryCount,
      timeoutMs: body.timeoutMs,
      secret,
    });

    await this.auditService.logFromRequest(
      req,
      "CREATE",
      "WEBHOOK",
      webhook.id,
      {
        newValues: {
          name: webhook.name,
          url: webhook.url,
          events: webhook.events,
          status: webhook.status,
          retryCount: webhook.retryCount,
          timeoutMs: webhook.timeoutMs,
        },
        metadata: { source: "webhook_create" },
      },
    );

    return webhook;
  }

  @RequireRole("ADMIN")
  @RequiresFeature("WEBHOOKS")
  @Put("webhooks/:id")
  @ApiOperation({ summary: "Update a webhook" })
  async updateWebhook(
    @Req() req: Request,
    @Param("id") id: string,
    @Body()
    body: {
      name?: string;
      url?: string;
      events?: WebhookEvent[];
      headers?: Record<string, string>;
    },
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);
    const existing = await this.webhookService.findById(id, merchantId);
    if (!existing) {
      throw new NotFoundException("Webhook not found");
    }

    if (body.url) {
      this.validateWebhookUrl(body.url);
      const testResult = await this.webhookService.testUrl({
        merchantId,
        url: body.url,
        secret: existing.secret,
        headers: body.headers || existing.headers,
        timeoutMs: existing.timeoutMs,
      });
      if (!testResult.success) {
        throw new BadRequestException(
          "فشل اختبار الـ Webhook. تأكد من الرابط وأنه يستقبل الطلبات.",
        );
      }
    }

    if (body.events && body.events.length === 0) {
      throw new BadRequestException("يرجى اختيار حدث واحد على الأقل");
    }

    const webhook = await this.webhookService.update(id, merchantId, body);

    if (!webhook) {
      throw new NotFoundException("Webhook not found");
    }

    await this.auditService.logFromRequest(req, "UPDATE", "WEBHOOK", id, {
      oldValues: {
        name: existing.name,
        url: existing.url,
        events: existing.events,
        headers: existing.headers,
        status: existing.status,
        retryCount: existing.retryCount,
        timeoutMs: existing.timeoutMs,
      },
      newValues: {
        name: webhook.name,
        url: webhook.url,
        events: webhook.events,
        headers: webhook.headers,
        status: webhook.status,
        retryCount: webhook.retryCount,
        timeoutMs: webhook.timeoutMs,
      },
      metadata: {
        changedFields: Object.keys(body || {}),
        source: "webhook_update",
      },
    });
    return webhook;
  }

  @RequireRole("ADMIN")
  @RequiresFeature("WEBHOOKS")
  @Put("webhooks/:id/status")
  @ApiOperation({ summary: "Update webhook status (pause/resume)" })
  async updateWebhookStatus(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() body: { status: "ACTIVE" | "PAUSED" },
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);
    const existing = await this.webhookService.findById(id, merchantId);
    if (!existing) {
      throw new NotFoundException("Webhook not found");
    }
    await this.webhookService.updateStatus(id, merchantId, body.status);
    await this.auditService.logFromRequest(req, "UPDATE", "WEBHOOK", id, {
      oldValues: { status: existing.status },
      newValues: { status: body.status },
      metadata: { source: "webhook_status" },
    });
    return { success: true };
  }

  @RequireRole("ADMIN")
  @RequiresFeature("WEBHOOKS")
  @Delete("webhooks/:id")
  @ApiOperation({ summary: "Delete a webhook" })
  async deleteWebhook(
    @Req() req: Request,
    @Param("id") id: string,
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);
    const existing = await this.webhookService.findById(id, merchantId);
    if (!existing) {
      throw new NotFoundException("Webhook not found");
    }
    const deleted = await this.webhookService.delete(id, merchantId);

    if (!deleted) {
      throw new NotFoundException("Webhook not found");
    }

    await this.auditService.logFromRequest(req, "DELETE", "WEBHOOK", id, {
      oldValues: {
        name: existing.name,
        url: existing.url,
        events: existing.events,
        status: existing.status,
      },
      metadata: { source: "webhook_delete" },
    });
    return { success: true };
  }

  @RequireRole("ADMIN")
  @RequiresFeature("WEBHOOKS")
  @Post("webhooks/:id/test")
  @ApiOperation({ summary: "Test a webhook" })
  async testWebhook(
    @Req() req: Request,
    @Param("id") id: string,
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);
    return this.webhookService.test(id, merchantId);
  }

  @RequireRole("ADMIN")
  @RequiresFeature("WEBHOOKS")
  @Post("webhooks/test-url")
  @ApiOperation({ summary: "Test a webhook URL before saving" })
  async testWebhookUrl(
    @Req() req: Request,
    @Body()
    body: {
      url: string;
      headers?: Record<string, string>;
      timeoutMs?: number;
    },
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);
    this.validateWebhookUrl(body.url);
    const secret = this.webhookService.generateSecret();
    return this.webhookService.testUrl({
      merchantId,
      url: body.url,
      secret,
      headers: body.headers,
      timeoutMs: body.timeoutMs,
    });
  }

  @RequireRole("ADMIN")
  @RequiresFeature("WEBHOOKS")
  @Post("webhooks/:id/regenerate-secret")
  @ApiOperation({ summary: "Regenerate webhook secret" })
  async regenerateWebhookSecret(
    @Req() req: Request,
    @Param("id") id: string,
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);
    const secret = await this.webhookService.regenerateSecret(id, merchantId);

    if (!secret) {
      throw new NotFoundException("Webhook not found");
    }

    await this.auditService.logFromRequest(req, "UPDATE", "WEBHOOK", id, {
      metadata: { action: "regenerate_secret" },
    });
    return { secret };
  }

  @Get("webhooks/:id/deliveries")
  @RequiresFeature("WEBHOOKS")
  @ApiOperation({ summary: "Get webhook delivery history" })
  @ApiQuery({ name: "limit", required: false })
  @ApiQuery({ name: "offset", required: false })
  async getWebhookDeliveries(
    @Req() req: Request,
    @Param("id") id: string,
    @Query("limit") limit?: number,
    @Query("offset") offset?: number,
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);
    const safeLimit = Number.isFinite(Number(limit)) ? Number(limit) : 50;
    const safeOffset = Number.isFinite(Number(offset)) ? Number(offset) : 0;
    return this.webhookService.getDeliveryHistory(
      id,
      merchantId,
      safeLimit,
      safeOffset,
    );
  }

  @Get("webhooks/deliveries")
  @RequiresFeature("WEBHOOKS")
  @ApiOperation({ summary: "Get recent webhook deliveries (all)" })
  @ApiQuery({ name: "limit", required: false })
  @ApiQuery({ name: "offset", required: false })
  async getRecentWebhookDeliveries(
    @Req() req: Request,
    @Query("limit") limit?: number,
    @Query("offset") offset?: number,
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);
    const safeLimit = Number.isFinite(Number(limit)) ? Number(limit) : 50;
    const safeOffset = Number.isFinite(Number(offset)) ? Number(offset) : 0;
    return this.webhookService.getRecentDeliveries(
      merchantId,
      safeLimit,
      safeOffset,
    );
  }

  @Get("webhooks/stats")
  @RequiresFeature("WEBHOOKS")
  @ApiOperation({ summary: "Get webhook statistics" })
  @ApiQuery({ name: "days", required: false })
  async getWebhookStats(
    @Req() req: Request,
    @Query("days") days?: number,
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);
    return this.webhookService.getStats(merchantId, days);
  }

  // ============== STAFF MANAGEMENT ==============

  @Get("staff")
  @RequiresFeature("TEAM")
  @ApiOperation({ summary: "Get all staff members" })
  async getStaff(@Req() req: Request): Promise<any> {
    const merchantId = this.getMerchantId(req);
    return this.staffService.findByMerchant(merchantId);
  }

  @Post("staff/invite")
  @RequiresFeature("TEAM")
  @Roles("OWNER", "ADMIN")
  @ApiOperation({ summary: "Invite a new staff member" })
  @ApiBody({
    schema: {
      type: "object",
      required: ["email", "name", "role"],
      properties: {
        email: { type: "string", format: "email" },
        name: { type: "string" },
        role: { type: "string", enum: ["ADMIN", "MANAGER", "AGENT", "VIEWER"] },
        permissions: { type: "object" },
      },
    },
  })
  async inviteStaff(
    @Req() req: Request,
    @Body()
    body: {
      email: string;
      name: string;
      role: StaffRole;
      permissions?: Record<string, any>;
    },
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);

    if (body.role === "OWNER") {
      throw new BadRequestException("Cannot invite new owners");
    }

    const { staff, inviteToken, tempPassword } = await this.staffService.invite(
      {
        merchantId,
        email: body.email,
        name: body.name,
        role: body.role,
        permissions: body.permissions,
      },
    );

    await this.auditService.logFromRequest(req, "CREATE", "STAFF", staff.id, {
      newValues: {
        name: staff.name,
        email: staff.email,
        role: staff.role,
        status: staff.status,
        permissions: staff.permissions,
      },
      metadata: { source: "team_invite" },
    });

    return {
      staff,
      inviteLink: inviteToken ? `/accept-invite?token=${inviteToken}` : null,
      tempPassword: tempPassword || undefined,
    };
  }

  @Put("staff/:id")
  @Roles("OWNER", "ADMIN")
  @ApiOperation({ summary: "Update a staff member" })
  async updateStaff(
    @Req() req: Request,
    @Param("id") id: string,
    @Body()
    body: {
      name?: string;
      role?: StaffRole;
      permissions?: Record<string, any>;
      status?: "ACTIVE" | "INACTIVE" | "SUSPENDED";
    },
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);
    const callerRole = (req as any).staffRole as StaffRole;
    const callerId = (req as any).staffId;
    const beforeStaff = await this.staffService.findById(id);
    if (!beforeStaff || beforeStaff.merchantId !== merchantId) {
      throw new NotFoundException("Staff member not found");
    }

    if (body.role === "OWNER") {
      throw new BadRequestException("Cannot change role to owner");
    }

    // Only OWNER can change roles
    if (body.role && callerRole !== "OWNER") {
      throw new BadRequestException("Only the owner can change staff roles");
    }

    // Prevent self-role change
    if (body.role && callerId === id) {
      throw new BadRequestException("Cannot change your own role");
    }

    const staff = await this.staffService.update(id, merchantId, body);

    if (!staff) {
      throw new NotFoundException("Staff member not found");
    }

    await this.auditService.logFromRequest(req, "UPDATE", "STAFF", id, {
      oldValues: {
        name: beforeStaff.name,
        role: beforeStaff.role,
        status: beforeStaff.status,
        permissions: beforeStaff.permissions,
      },
      newValues: {
        name: staff.name,
        role: staff.role,
        status: staff.status,
        permissions: staff.permissions,
      },
      metadata: {
        changedFields: Object.keys(body || {}),
        source: "team_update",
      },
    });
    return staff;
  }

  @Delete("staff/:id")
  @RequiresFeature("TEAM")
  @Roles("OWNER", "ADMIN")
  @ApiOperation({ summary: "Remove a staff member" })
  async deleteStaff(
    @Req() req: Request,
    @Param("id") id: string,
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);
    const beforeStaff = await this.staffService.findById(id);
    if (!beforeStaff || beforeStaff.merchantId !== merchantId) {
      throw new NotFoundException("Staff member not found");
    }
    const deleted = await this.staffService.delete(id, merchantId);

    if (!deleted) {
      throw new NotFoundException("Staff member not found");
    }

    await this.auditService.logFromRequest(req, "DELETE", "STAFF", id, {
      oldValues: {
        name: beforeStaff.name,
        email: beforeStaff.email,
        role: beforeStaff.role,
        status: beforeStaff.status,
      },
      metadata: { source: "team_delete" },
    });
    return { success: true };
  }

  @Get("staff/:id/sessions")
  @RequiresFeature("TEAM")
  @ApiOperation({ summary: "Get staff sessions" })
  async getStaffSessions(
    @Req() req: Request,
    @Param("id") id: string,
  ): Promise<any> {
    return this.staffService.getSessions(id);
  }

  @Delete("staff/:id/sessions/:sessionId")
  @RequiresFeature("TEAM")
  @Roles("OWNER", "ADMIN")
  @ApiOperation({ summary: "Revoke a staff session" })
  async revokeStaffSession(
    @Req() req: Request,
    @Param("id") id: string,
    @Param("sessionId") sessionId: string,
  ): Promise<any> {
    await this.staffService.revokeSession(id, sessionId);
    return { success: true };
  }

  // ============== BULK OPERATIONS ==============

  @Get("bulk-operations")
  @ApiOperation({ summary: "Get bulk operations history" })
  @ApiQuery({ name: "status", required: false })
  @ApiQuery({ name: "resourceType", required: false })
  @ApiQuery({ name: "limit", required: false })
  @ApiQuery({ name: "offset", required: false })
  async getBulkOperations(
    @Req() req: Request,
    @Query("status") status?: any,
    @Query("resourceType") resourceType?: any,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);
    const parsedLimit = limit ? parseInt(limit, 10) : 20;
    const parsedOffset = offset ? parseInt(offset, 10) : 0;
    return this.bulkOpsService.getOperations(
      merchantId,
      { status, resourceType },
      parsedLimit,
      parsedOffset,
    );
  }

  @Get("bulk-operations/:id")
  @ApiOperation({ summary: "Get bulk operation details" })
  async getBulkOperation(
    @Req() req: Request,
    @Param("id") id: string,
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);
    const operation = await this.bulkOpsService.getOperation(id, merchantId);

    if (!operation) {
      throw new NotFoundException("Operation not found");
    }

    return operation;
  }

  @RequireRole("MANAGER")
  @Post("bulk-operations/:id/cancel")
  @ApiOperation({ summary: "Cancel a pending bulk operation" })
  async cancelBulkOperation(
    @Req() req: Request,
    @Param("id") id: string,
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);
    const cancelled = await this.bulkOpsService.cancelOperation(id, merchantId);

    if (!cancelled) {
      throw new BadRequestException("Cannot cancel this operation");
    }

    return { success: true };
  }

  @RequireRole("MANAGER")
  @RequiresFeature("CATALOG")
  @Post("products/import")
  @ApiOperation({ summary: "Import products from CSV" })
  @UseInterceptors(
    FileInterceptor("file", ProductionFeaturesController.CSV_UPLOAD_OPTIONS),
  )
  async importProducts(
    @Req() req: Request,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { updateExisting?: string; dryRun?: string },
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);

    if (!file || !file.buffer) {
      throw new BadRequestException("No file uploaded or file is empty");
    }

    // Read CSV content from file buffer
    const csvData = file.buffer.toString("utf-8");

    const options = {
      updateExisting: body.updateExisting === "true",
      dryRun: body.dryRun === "true",
    };

    const operation = await this.bulkOpsService.importProducts(
      merchantId,
      csvData,
      options,
    );

    await this.auditService.logFromRequest(
      req,
      "IMPORT",
      "PRODUCT",
      operation.id,
      {
        metadata: { totalRecords: operation.totalRecords },
      },
    );

    return operation;
  }

  @Get("products/export")
  @RequiresFeature("CATALOG")
  @ApiOperation({ summary: "Export products to CSV" })
  @ApiQuery({ name: "format", required: false, enum: ["csv", "json"] })
  async exportProducts(
    @Req() req: Request,
    @Res() res: Response,
    @Query("format") format?: "csv" | "json",
  ): Promise<void> {
    const merchantId = this.getMerchantId(req);
    const { operation, data } = await this.bulkOpsService.exportProducts(
      merchantId,
      { format: format || "csv" },
    );

    await this.auditService.logFromRequest(
      req,
      "EXPORT",
      "PRODUCT",
      operation.id,
    );

    const contentType = format === "json" ? "application/json" : "text/csv";
    const filename = `products-${Date.now()}.${format || "csv"}`;

    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(data);
  }

  @RequireRole("MANAGER")
  @Post("customers/import")
  @ApiOperation({ summary: "Import customers from CSV" })
  @UseInterceptors(
    FileInterceptor("file", ProductionFeaturesController.CSV_UPLOAD_OPTIONS),
  )
  @ApiConsumes("multipart/form-data")
  async importCustomers(
    @Req() req: Request,
    @UploadedFile() file: Express.Multer.File,
    @Body()
    body: {
      csvData?: string;
      options?: any;
      updateExisting?: string;
      dryRun?: string;
    },
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);

    // Support both file upload and raw csvData
    let csvData: string;
    if (file) {
      csvData = file.buffer.toString("utf-8");
    } else if (body.csvData) {
      if (
        body.csvData.length >
        ProductionFeaturesController.CSV_UPLOAD_LIMIT_BYTES
      ) {
        throw new BadRequestException("CSV payload exceeds size limit");
      }
      csvData = body.csvData;
    } else {
      throw new BadRequestException("Either file or csvData is required");
    }

    const options = {
      updateExisting:
        body.updateExisting === "true" || body.options?.updateExisting,
      dryRun: body.dryRun === "true" || body.options?.dryRun,
    };

    const operation = await this.bulkOpsService.importCustomers(
      merchantId,
      csvData,
      options,
    );

    await this.auditService.logFromRequest(
      req,
      "IMPORT",
      "CUSTOMER",
      operation.id,
    );
    return operation;
  }

  @Get("customers/export")
  @ApiOperation({ summary: "Export customers to CSV" })
  @ApiQuery({ name: "format", required: false, enum: ["csv", "json"] })
  async exportCustomers(
    @Req() req: Request,
    @Res() res: Response,
    @Query("format") format?: "csv" | "json",
  ): Promise<void> {
    const merchantId = this.getMerchantId(req);
    const { operation, data } = await this.bulkOpsService.exportCustomers(
      merchantId,
      { format: format || "csv" },
    );

    await this.auditService.logFromRequest(
      req,
      "EXPORT",
      "CUSTOMER",
      operation.id,
    );

    const contentType = format === "json" ? "application/json" : "text/csv";
    res.setHeader("Content-Type", contentType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="customers-${Date.now()}.${format || "csv"}"`,
    );
    res.send(data);
  }

  @RequireRole("MANAGER")
  @RequiresFeature("INVENTORY")
  @Post("inventory/import")
  @ApiOperation({ summary: "Import inventory updates from CSV" })
  @UseInterceptors(
    FileInterceptor("file", ProductionFeaturesController.CSV_UPLOAD_OPTIONS),
  )
  @ApiConsumes("multipart/form-data")
  async importInventory(
    @Req() req: Request,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { updateExisting?: string; dryRun?: string },
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);

    if (!file) {
      throw new BadRequestException("CSV file is required");
    }

    const csvData = file.buffer.toString("utf-8");
    const options = {
      updateExisting: body.updateExisting === "true",
      dryRun: body.dryRun === "true",
    };

    const operation = await this.bulkOpsService.importInventory(
      merchantId,
      csvData,
      options,
    );

    await this.auditService.logFromRequest(
      req,
      "IMPORT",
      "INVENTORY",
      operation.id,
    );
    return operation;
  }

  @RequireRole("MANAGER")
  @RequiresFeature("INVENTORY")
  @Get("inventory/export")
  @ApiOperation({ summary: "Export inventory to CSV" })
  @ApiQuery({ name: "format", required: false, enum: ["csv", "json"] })
  async exportInventory(
    @Req() req: Request,
    @Res() res: Response,
    @Query("format") format?: "csv" | "json",
  ): Promise<void> {
    const merchantId = this.getMerchantId(req);
    const { operation, data } = await this.bulkOpsService.exportInventory(
      merchantId,
      { format: format || "csv" },
    );

    await this.auditService.logFromRequest(
      req,
      "EXPORT",
      "INVENTORY",
      operation.id,
    );

    const contentType = format === "json" ? "application/json" : "text/csv";
    const filename = `inventory-${Date.now()}.${format || "csv"}`;
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(data);
  }

  @RequireRole("MANAGER")
  @Post("inventory/bulk-update")
  @ApiOperation({ summary: "Bulk update inventory levels" })
  @ApiBody({
    schema: {
      type: "object",
      required: ["updates"],
      properties: {
        updates: {
          type: "array",
          items: {
            type: "object",
            properties: {
              sku: { type: "string" },
              quantity: { type: "number" },
              operation: { type: "string", enum: ["SET", "ADD", "SUBTRACT"] },
            },
          },
        },
      },
    },
  })
  async bulkUpdateInventory(
    @Req() req: Request,
    @Body()
    body: {
      updates: Array<{
        sku: string;
        quantity: number;
        operation?: "SET" | "ADD" | "SUBTRACT";
      }>;
    },
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);
    const operation = await this.bulkOpsService.bulkUpdateInventory(
      merchantId,
      body.updates,
    );

    await this.auditService.logFromRequest(
      req,
      "UPDATE",
      "VARIANT",
      operation.id,
      {
        metadata: { updateCount: body.updates.length },
      },
    );

    return operation;
  }

  // ============== INGREDIENTS IMPORT/EXPORT ==============

  @RequireRole("MANAGER")
  @RequiresFeature("CATALOG")
  @Post("ingredients/import")
  @ApiOperation({ summary: "Import recipe ingredients from CSV" })
  @UseInterceptors(
    FileInterceptor("file", ProductionFeaturesController.CSV_UPLOAD_OPTIONS),
  )
  @ApiConsumes("multipart/form-data")
  async importIngredients(
    @Req() req: Request,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { updateExisting?: string; dryRun?: string },
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);

    if (!file || !file.buffer) {
      throw new BadRequestException("No file uploaded or file is empty");
    }

    const csvData = file.buffer.toString("utf-8");
    const options = {
      updateExisting: body.updateExisting === "true",
      dryRun: body.dryRun === "true",
    };

    const operation = await this.bulkOpsService.importIngredients(
      merchantId,
      csvData,
      options,
    );

    await this.auditService.logFromRequest(
      req,
      "IMPORT",
      "PRODUCT",
      operation.id,
      {
        metadata: { type: "ingredients", totalRecords: operation.totalRecords },
      },
    );

    return operation;
  }

  @Get("ingredients/export")
  @RequiresFeature("CATALOG")
  @ApiOperation({ summary: "Export recipe ingredients to CSV" })
  @ApiQuery({ name: "format", required: false, enum: ["csv", "json"] })
  async exportIngredients(
    @Req() req: Request,
    @Res() res: Response,
    @Query("format") format?: "csv" | "json",
  ): Promise<void> {
    const merchantId = this.getMerchantId(req);
    const { operation, data } = await this.bulkOpsService.exportIngredients(
      merchantId,
      { format: format || "csv" },
    );

    await this.auditService.logFromRequest(
      req,
      "EXPORT",
      "PRODUCT",
      operation.id,
      {
        metadata: { type: "ingredients" },
      },
    );

    const contentType = format === "json" ? "application/json" : "text/csv";
    const filename = `ingredients-${Date.now()}.${format || "csv"}`;
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(data);
  }

  // ============== RATE LIMIT MANAGEMENT ==============

  @Get("rate-limits/violations")
  @ApiOperation({ summary: "Get rate limit violations" })
  @ApiQuery({ name: "days", required: false })
  async getRateLimitViolations(
    @Req() req: Request,
    @Query("days") days?: number,
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);
    return this.rateLimitService.getViolations(merchantId, days || 7);
  }

  @Get("rate-limits/stats")
  @ApiOperation({ summary: "Get rate limit violation stats" })
  @ApiQuery({ name: "days", required: false })
  async getRateLimitStats(
    @Req() req: Request,
    @Query("days") days?: number,
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);
    return this.rateLimitService.getViolationStats(merchantId, days || 7);
  }

  private validateWebhookUrl(url: string) {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new BadRequestException("رابط Webhook غير صالح");
    }

    if (parsed.protocol !== "https:") {
      throw new BadRequestException("يجب استخدام HTTPS في رابط الـ Webhook");
    }

    const hostname = parsed.hostname.toLowerCase();
    if (hostname === "localhost" || hostname.endsWith(".local")) {
      throw new BadRequestException("لا يمكن استخدام روابط محلية لويب هوك");
    }

    if (this.isPrivateIp(hostname)) {
      throw new BadRequestException("لا يمكن استخدام عناوين IP خاصة أو محلية");
    }
  }

  private isPrivateIp(hostname: string): boolean {
    if (net.isIP(hostname) === 0) return false;
    if (hostname === "127.0.0.1" || hostname === "0.0.0.0") return true;
    if (hostname.startsWith("10.")) return true;
    if (hostname.startsWith("192.168.")) return true;
    if (hostname.startsWith("169.254.")) return true;
    const octets = hostname.split(".").map(Number);
    if (
      octets.length === 4 &&
      octets[0] === 172 &&
      octets[1] >= 16 &&
      octets[1] <= 31
    )
      return true;
    if (
      hostname === "::1" ||
      hostname.startsWith("fe80") ||
      hostname.startsWith("fc") ||
      hostname.startsWith("fd")
    )
      return true;
    return false;
  }
}

// ============== STAFF AUTH CONTROLLER (Public) ==============

@ApiTags("Staff Authentication")
@Controller("v1/staff")
export class StaffAuthController {
  constructor(
    private readonly staffService: StaffService,
    private readonly auditService: AuditService,
  ) {}

  @Post("login")
  @UseGuards(EnhancedRateLimitGuard)
  @RateLimit({ limit: 5, window: 60, keyType: "ip" })
  @ApiOperation({ summary: "Staff login" })
  @ApiBody({
    schema: {
      type: "object",
      required: ["merchantId", "email", "password"],
      properties: {
        merchantId: { type: "string" },
        email: { type: "string" },
        password: { type: "string" },
      },
    },
  })
  async login(
    @Body() body: { merchantId: string; email: string; password: string },
    @Req() req: Request,
  ): Promise<any> {
    try {
      const result = await this.staffService.login(
        body.merchantId,
        body.email,
        body.password,
        {
          userAgent: req.headers["user-agent"],
          ip: req.ip,
        },
      );

      if (!result.requiresMfa) {
        await this.auditService.log({
          merchantId: body.merchantId,
          staffId: result.staff.id,
          action: "LOGIN",
          resource: "STAFF",
          resourceId: result.staff.id,
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"],
        });
      }

      return result;
    } catch (error: any) {
      // Audit log: failed login attempt
      const isLockout = error?.message?.includes("locked");
      await this.auditService.log({
        merchantId: body.merchantId,
        action: isLockout ? "ACCOUNT_LOCKED" : "LOGIN_FAILED",
        resource: "STAFF",
        metadata: { email: body.email, reason: error?.message },
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      });
      throw error;
    }
  }

  @Post("refresh")
  @ApiOperation({ summary: "Refresh access token" })
  @ApiBody({
    schema: {
      type: "object",
      required: ["refreshToken"],
      properties: {
        refreshToken: { type: "string" },
      },
    },
  })
  async refreshToken(@Body() body: { refreshToken: string }): Promise<any> {
    return this.staffService.refreshTokens(body.refreshToken);
  }

  @Post("logout")
  @ApiOperation({ summary: "Staff logout" })
  @ApiBody({
    schema: {
      type: "object",
      required: ["refreshToken"],
      properties: {
        refreshToken: {
          type: "string",
          description: "The refresh token to revoke",
        },
        allDevices: { type: "boolean", description: "Revoke all sessions" },
      },
    },
  })
  async logout(
    @Body() body: { refreshToken: string; allDevices?: boolean },
  ): Promise<any> {
    // Security: derive staffId from the refresh token instead of accepting from body (IDOR fix)
    const tokenPayload = await this.staffService.verifyRefreshTokenPayload(
      body.refreshToken,
    );
    if (!tokenPayload?.staffId) {
      // If token is invalid/expired, still return success (don't leak info)
      return { success: true };
    }
    await this.staffService.logout(
      tokenPayload.staffId,
      body.allDevices ? undefined : body.refreshToken,
    );
    return { success: true };
  }

  @Post("accept-invite")
  @ApiOperation({ summary: "Accept invite and set password" })
  @ApiBody({
    schema: {
      type: "object",
      required: ["inviteToken", "password"],
      properties: {
        inviteToken: { type: "string" },
        password: { type: "string" },
      },
    },
  })
  async acceptInvite(
    @Body() body: { inviteToken: string; password: string },
  ): Promise<any> {
    return this.staffService.acceptInvite(body.inviteToken, body.password);
  }

  @Post("forgot-password")
  @UseGuards(EnhancedRateLimitGuard)
  @RateLimit({ limit: 3, window: 60, keyType: "ip" })
  @ApiOperation({ summary: "Request password reset" })
  @ApiBody({
    schema: {
      type: "object",
      required: ["merchantId", "email"],
      properties: {
        merchantId: { type: "string" },
        email: { type: "string" },
      },
    },
  })
  async forgotPassword(
    @Body() body: { merchantId: string; email: string },
  ): Promise<any> {
    const token = await this.staffService.requestPasswordReset(
      body.merchantId,
      body.email,
    );
    if (process.env.NODE_ENV !== "production") {
      return {
        message: "If this email exists, a reset link will be sent",
        token,
      };
    }
    return { message: "If this email exists, a reset link will be sent" };
  }

  @Post("reset-password")
  @UseGuards(EnhancedRateLimitGuard)
  @RateLimit({ limit: 5, window: 60, keyType: "ip" })
  @ApiOperation({ summary: "Reset password with token" })
  @ApiBody({
    schema: {
      type: "object",
      required: ["resetToken", "password"],
      properties: {
        resetToken: { type: "string" },
        password: { type: "string" },
      },
    },
  })
  async resetPassword(
    @Body() body: { resetToken: string; password: string },
  ): Promise<any> {
    await this.staffService.resetPassword(body.resetToken, body.password);
    return { success: true };
  }

  @Post("change-password")
  @UseGuards(MerchantApiKeyGuard)
  @ApiOperation({ summary: "Change password (authenticated via JWT)" })
  @ApiSecurity("bearer")
  @ApiBody({
    schema: {
      type: "object",
      required: ["currentPassword", "newPassword"],
      properties: {
        currentPassword: { type: "string" },
        newPassword: { type: "string" },
      },
    },
  })
  async changePassword(
    @Req() req: Request,
    @Body() body: { currentPassword: string; newPassword: string },
  ): Promise<any> {
    // Security: get staffId from JWT token, not from body (IDOR fix)
    const staffId = (req as any).staffId;
    if (!staffId) {
      throw new ForbiddenException("Authentication required");
    }
    await this.staffService.changePassword(
      staffId,
      body.currentPassword,
      body.newPassword,
    );

    // Audit log: password change event
    await this.auditService.logFromRequest(
      req,
      "PASSWORD_CHANGE",
      "STAFF",
      staffId,
      {
        metadata: { action: "تغيير_كلمة_المرور_بواسطة_المستخدم" },
      },
    );

    return {
      success: true,
      message:
        "تم تغيير كلمة المرور بنجاح. يرجى إعادة تسجيل الدخول بكلمة المرور الجديدة.",
    };
  }
}
