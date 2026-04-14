import {
  Controller,
  Get,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Param,
  Req,
  UseGuards,
  UnauthorizedException,
  Body,
} from "@nestjs/common";
import { ApiHeader, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsIn,
  IsInt,
  MaxLength,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from "class-validator";
import { Request } from "express";
import { MerchantApiKeyGuard } from "../../shared/guards/merchant-api-key.guard";
import {
  EntitlementGuard,
  RequiresFeature,
} from "../../shared/guards/entitlement.guard";
import { RequireRole, RolesGuard } from "../../shared/guards/roles.guard";
import { IntegrationService } from "../../application/services/integration.service";
import { AuditService } from "../../application/services/audit.service";
import { ConnectorRuntimeService } from "../../application/services/connector-runtime.service";

const ERP_PULL_MODES = ["orders", "payments", "both"] as const;
const RECONCILIATION_SCOPES = [
  "orders",
  "payments",
  "inventory",
  "catalog",
  "all",
] as const;
const CONNECTOR_RUNTIME_EVENT_STATUSES = [
  "PENDING",
  "PROCESSING",
  "PROCESSED",
  "RETRY",
  "DEAD_LETTER",
] as const;
const CONNECTOR_RUNTIME_WORKER_STATUSES = [
  "COMPLETED",
  "FAILED",
  "SKIPPED",
] as const;

class PullErpDto {
  @IsOptional()
  @IsIn(ERP_PULL_MODES)
  mode?: "orders" | "payments" | "both";
}

class ListEventsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

class ConnectorRuntimeProcessDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsUUID()
  endpointId?: string;
}

class ConnectorRuntimeRecoverStuckDto {
  @IsOptional()
  @IsUUID()
  endpointId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(240)
  olderThanMinutes?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

class ConnectorRuntimeListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

class ConnectorRuntimeWorkerCyclesQueryDto extends ConnectorRuntimeListQueryDto {
  @IsOptional()
  @IsIn(CONNECTOR_RUNTIME_WORKER_STATUSES)
  status?: "COMPLETED" | "FAILED" | "SKIPPED";
}

class ConnectorRuntimeEventsQueryDto {
  @IsOptional()
  @IsIn(CONNECTOR_RUNTIME_EVENT_STATUSES)
  status?: "PENDING" | "PROCESSING" | "PROCESSED" | "RETRY" | "DEAD_LETTER";

  @IsOptional()
  @IsUUID()
  endpointId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

class StartConnectorReconciliationDto {
  @IsOptional()
  @IsUUID()
  endpointId?: string;

  @IsOptional()
  @IsIn(RECONCILIATION_SCOPES)
  scope?: "orders" | "payments" | "inventory" | "catalog" | "all";
}

class ConnectorReconciliationItemsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;

  @IsOptional()
  @IsIn(["OPEN", "RESOLVED", "IGNORED"])
  status?: "OPEN" | "RESOLVED" | "IGNORED";
}

class ResolveConnectorReconciliationItemDto {
  @IsIn(["RESOLVED", "IGNORED"])
  action!: "RESOLVED" | "IGNORED";

  @IsOptional()
  @IsString()
  note?: string;
}

class RetryConnectorRuntimeDlqBatchDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @IsOptional()
  @IsUUID()
  endpointId?: string;
}

class DiscardConnectorRuntimeDlqDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

class DiscardConnectorRuntimeDlqBatchDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @IsOptional()
  @IsUUID()
  endpointId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

class ReopenConnectorReconciliationItemDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

@ApiTags("Integrations")
@Controller("v1/portal/integrations")
@UseGuards(MerchantApiKeyGuard, RolesGuard, EntitlementGuard)
@RequiresFeature("WEBHOOKS")
@ApiHeader({
  name: "X-API-Key",
  description: "Merchant API Key",
  required: true,
})
export class IntegrationsController {
  constructor(
    private readonly integrationService: IntegrationService,
    private readonly connectorRuntimeService: ConnectorRuntimeService,
    private readonly auditService: AuditService,
  ) {}

  private getMerchantId(req: Request): string {
    const merchantId = (req as any).merchantId;
    if (!merchantId) {
      throw new UnauthorizedException("Merchant not authorized");
    }
    return merchantId;
  }

  @Get("erp")
  @RequireRole("MANAGER")
  @ApiOperation({ summary: "Get ERP inbound integration endpoint" })
  async getErpEndpoint(@Req() req: Request) {
    const merchantId = this.getMerchantId(req);
    const endpoint =
      await this.integrationService.getOrCreateErpEndpoint(merchantId);
    return {
      id: endpoint.id,
      status: endpoint.status,
      secret: endpoint.secret,
      lastEventAt: endpoint.lastEventAt,
      endpointUrl: `/api/v1/integrations/erp/${merchantId}/events`,
    };
  }

  @Get("erp/config")
  @RequireRole("MANAGER")
  @ApiOperation({ summary: "Get ERP integration config" })
  async getErpConfig(@Req() req: Request) {
    const merchantId = this.getMerchantId(req);
    return this.integrationService.getErpConfig(merchantId);
  }

  @Put("erp/config")
  @RequireRole("OWNER")
  @ApiOperation({ summary: "Update ERP integration config" })
  async updateErpConfig(
    @Req() req: Request,
    @Body() body: Record<string, any>,
  ) {
    const merchantId = this.getMerchantId(req);
    const updated = await this.integrationService.updateErpConfig(
      merchantId,
      body || {},
    );
    await this.auditService.logFromRequest(
      req,
      "UPDATE",
      "SETTINGS",
      merchantId,
      {
        metadata: {
          integration: "ERP",
          action: "update_config",
          sections: ["integrations"],
        },
      },
    );
    return updated;
  }

  @Post("erp/regenerate-secret")
  @RequireRole("OWNER")
  @ApiOperation({ summary: "Regenerate ERP integration secret" })
  async regenerateSecret(@Req() req: Request) {
    const merchantId = this.getMerchantId(req);
    const secret =
      await this.integrationService.regenerateErpSecret(merchantId);
    await this.auditService.logFromRequest(
      req,
      "UPDATE",
      "SETTINGS",
      merchantId,
      {
        metadata: {
          integration: "ERP",
          action: "regenerate_secret",
          sections: ["integrations"],
        },
      },
    );
    return { secret };
  }

  @Post("erp/test")
  @RequireRole("MANAGER")
  @ApiOperation({ summary: "Send a test ERP event" })
  async testErp(@Req() req: Request) {
    const merchantId = this.getMerchantId(req);
    const endpoint =
      await this.integrationService.getOrCreateErpEndpoint(merchantId);
    return this.integrationService.processErpEvent(
      merchantId,
      endpoint.id,
      "test.ping",
      {},
    );
  }

  @Post("erp/pull")
  @RequireRole("MANAGER")
  @ApiOperation({ summary: "Pull ERP data via connector (orders/payments)" })
  async pullErp(@Req() req: Request, @Body() body: PullErpDto) {
    const merchantId = this.getMerchantId(req);
    return this.integrationService.pullErpEvents(
      merchantId,
      body?.mode || "both",
    );
  }

  @Get("erp/events")
  @RequireRole("MANAGER")
  @ApiOperation({ summary: "List ERP integration events" })
  @ApiQuery({ name: "limit", required: false })
  @ApiQuery({ name: "offset", required: false })
  async listEvents(@Req() req: Request, @Query() query: ListEventsQueryDto) {
    const merchantId = this.getMerchantId(req);
    const safeLimit = query.limit ?? 50;
    const safeOffset = query.offset ?? 0;
    return this.integrationService.listEvents(
      merchantId,
      safeLimit,
      safeOffset,
    );
  }

  @Get("erp/runtime/event-taxonomy")
  @RequireRole("MANAGER")
  @ApiOperation({ summary: "Get connector runtime event taxonomy" })
  getConnectorRuntimeTaxonomy() {
    return this.connectorRuntimeService.getEventTaxonomy();
  }

  @Get("erp/runtime/health")
  @RequireRole("MANAGER")
  @ApiOperation({ summary: "Get connector runtime health snapshot" })
  async getConnectorRuntimeHealth(@Req() req: Request) {
    const merchantId = this.getMerchantId(req);
    return this.connectorRuntimeService.getHealth(merchantId);
  }

  @Get("erp/runtime/worker-cycles/latest")
  @RequireRole("MANAGER")
  @ApiOperation({
    summary:
      "Get latest connector runtime worker-cycle outcome for this merchant",
  })
  async getLatestConnectorRuntimeWorkerCycle(@Req() req: Request) {
    const merchantId = this.getMerchantId(req);
    return this.connectorRuntimeService.getLatestWorkerCycleSummary(merchantId);
  }

  @Get("erp/runtime/worker-cycles")
  @RequireRole("MANAGER")
  @ApiOperation({
    summary: "List connector runtime worker-cycle outcomes for this merchant",
  })
  async listConnectorRuntimeWorkerCycles(
    @Req() req: Request,
    @Query() query: ConnectorRuntimeWorkerCyclesQueryDto,
  ) {
    const merchantId = this.getMerchantId(req);
    return this.connectorRuntimeService.listWorkerCycleOutcomes({
      merchantId,
      status: query.status,
      limit: query.limit,
      offset: query.offset,
    });
  }

  @Post("erp/runtime/process")
  @RequireRole("MANAGER")
  @ApiOperation({ summary: "Process queued connector runtime events" })
  async processConnectorRuntimeQueue(
    @Req() req: Request,
    @Body() body: ConnectorRuntimeProcessDto,
  ) {
    const merchantId = this.getMerchantId(req);
    return this.connectorRuntimeService.processQueue({
      merchantId,
      limit: body.limit ?? 25,
      endpointId: body.endpointId,
    });
  }

  @Post("erp/runtime/recover-stuck")
  @RequireRole("MANAGER")
  @ApiOperation({
    summary: "Recover stuck PROCESSING connector runtime events",
  })
  async recoverStuckConnectorRuntimeEvents(
    @Req() req: Request,
    @Body() body: ConnectorRuntimeRecoverStuckDto,
  ) {
    const merchantId = this.getMerchantId(req);
    return this.connectorRuntimeService.recoverStuckProcessing({
      merchantId,
      endpointId: body.endpointId,
      olderThanMinutes: body.olderThanMinutes,
      limit: body.limit,
    });
  }

  @Get("erp/runtime/events")
  @RequireRole("MANAGER")
  @ApiOperation({ summary: "List connector runtime events for operations" })
  async listConnectorRuntimeEvents(
    @Req() req: Request,
    @Query() query: ConnectorRuntimeEventsQueryDto,
  ) {
    const merchantId = this.getMerchantId(req);
    return this.connectorRuntimeService.listRuntimeEvents({
      merchantId,
      status: query.status,
      endpointId: query.endpointId,
      limit: query.limit,
      offset: query.offset,
    });
  }

  @Get("erp/runtime/dlq")
  @RequireRole("MANAGER")
  @ApiOperation({ summary: "List connector runtime DLQ items" })
  async listConnectorRuntimeDlq(
    @Req() req: Request,
    @Query() query: ConnectorRuntimeListQueryDto,
  ) {
    const merchantId = this.getMerchantId(req);
    return this.connectorRuntimeService.listDlq(
      merchantId,
      query.limit ?? 50,
      query.offset ?? 0,
    );
  }

  @Post("erp/runtime/dlq/:dlqId/retry")
  @RequireRole("MANAGER")
  @ApiOperation({ summary: "Retry connector runtime DLQ item" })
  async retryConnectorRuntimeDlq(
    @Req() req: Request,
    @Param("dlqId", new ParseUUIDPipe()) dlqId: string,
  ) {
    const merchantId = this.getMerchantId(req);
    return this.connectorRuntimeService.retryDlq(merchantId, dlqId);
  }

  @Put("erp/runtime/dlq/:dlqId/discard")
  @RequireRole("MANAGER")
  @ApiOperation({ summary: "Discard connector runtime DLQ item" })
  async discardConnectorRuntimeDlq(
    @Req() req: Request,
    @Param("dlqId", new ParseUUIDPipe()) dlqId: string,
    @Body() body: DiscardConnectorRuntimeDlqDto,
  ) {
    const merchantId = this.getMerchantId(req);
    return this.connectorRuntimeService.discardDlq(
      merchantId,
      dlqId,
      body.reason,
    );
  }

  @Post("erp/runtime/dlq/retry-open")
  @RequireRole("MANAGER")
  @ApiOperation({ summary: "Retry OPEN connector runtime DLQ items in batch" })
  async retryOpenConnectorRuntimeDlqBatch(
    @Req() req: Request,
    @Body() body: RetryConnectorRuntimeDlqBatchDto,
  ) {
    const merchantId = this.getMerchantId(req);
    return this.connectorRuntimeService.retryDlqBatch({
      merchantId,
      limit: body.limit ?? 25,
      endpointId: body.endpointId,
    });
  }

  @Post("erp/runtime/dlq/discard-open")
  @RequireRole("MANAGER")
  @ApiOperation({
    summary: "Discard OPEN connector runtime DLQ items in batch",
  })
  async discardOpenConnectorRuntimeDlqBatch(
    @Req() req: Request,
    @Body() body: DiscardConnectorRuntimeDlqBatchDto,
  ) {
    const merchantId = this.getMerchantId(req);
    return this.connectorRuntimeService.discardDlqBatch({
      merchantId,
      limit: body.limit ?? 25,
      endpointId: body.endpointId,
      reason: body.reason,
    });
  }

  @Post("erp/runtime/reconciliation")
  @RequireRole("MANAGER")
  @ApiOperation({ summary: "Start connector reconciliation run (foundation)" })
  async startConnectorReconciliation(
    @Req() req: Request,
    @Body() body: StartConnectorReconciliationDto,
  ) {
    const merchantId = this.getMerchantId(req);
    const staffId = (req as any)?.staffId ? String((req as any).staffId) : null;
    return this.connectorRuntimeService.startReconciliation({
      merchantId,
      endpointId: body?.endpointId,
      scope: body?.scope || "all",
      createdBy: staffId || undefined,
    });
  }

  @Get("erp/runtime/reconciliation")
  @RequireRole("MANAGER")
  @ApiOperation({ summary: "List connector reconciliation runs" })
  async listConnectorReconciliationRuns(
    @Req() req: Request,
    @Query() query: ConnectorRuntimeListQueryDto,
  ) {
    const merchantId = this.getMerchantId(req);
    return this.connectorRuntimeService.listReconciliationRuns(
      merchantId,
      query.limit ?? 30,
      query.offset ?? 0,
    );
  }

  @Get("erp/runtime/reconciliation/:runId/summary")
  @RequireRole("MANAGER")
  @ApiOperation({
    summary: "Get connector reconciliation drift summary for a run",
  })
  async getConnectorReconciliationRunSummary(
    @Req() req: Request,
    @Param("runId", new ParseUUIDPipe()) runId: string,
  ) {
    const merchantId = this.getMerchantId(req);
    return this.connectorRuntimeService.getReconciliationRunSummary({
      merchantId,
      runId,
    });
  }

  @Get("erp/runtime/reconciliation/:runId")
  @RequireRole("MANAGER")
  @ApiOperation({
    summary: "Get connector reconciliation run with drift items",
  })
  async getConnectorReconciliationRunDetails(
    @Req() req: Request,
    @Param("runId", new ParseUUIDPipe()) runId: string,
    @Query() query: ConnectorReconciliationItemsQueryDto,
  ) {
    const merchantId = this.getMerchantId(req);
    return this.connectorRuntimeService.getReconciliationRunDetails({
      merchantId,
      runId,
      limit: query.limit ?? 50,
      offset: query.offset ?? 0,
      status: query.status,
    });
  }

  @Put("erp/runtime/reconciliation/:runId/items/:itemId")
  @RequireRole("MANAGER")
  @ApiOperation({ summary: "Resolve or ignore reconciliation drift item" })
  async resolveConnectorReconciliationItem(
    @Req() req: Request,
    @Param("runId", new ParseUUIDPipe()) runId: string,
    @Param("itemId", new ParseUUIDPipe()) itemId: string,
    @Body() body: ResolveConnectorReconciliationItemDto,
  ) {
    const merchantId = this.getMerchantId(req);
    return this.connectorRuntimeService.resolveReconciliationItem({
      merchantId,
      runId,
      itemId,
      action: body.action,
      note: body.note,
    });
  }

  @Put("erp/runtime/reconciliation/:runId/items/:itemId/reopen")
  @RequireRole("MANAGER")
  @ApiOperation({ summary: "Reopen reconciliation drift item for re-triage" })
  async reopenConnectorReconciliationItem(
    @Req() req: Request,
    @Param("runId", new ParseUUIDPipe()) runId: string,
    @Param("itemId", new ParseUUIDPipe()) itemId: string,
    @Body() body: ReopenConnectorReconciliationItemDto,
  ) {
    const merchantId = this.getMerchantId(req);
    return this.connectorRuntimeService.reopenReconciliationItem({
      merchantId,
      runId,
      itemId,
      note: body.note,
    });
  }
}
