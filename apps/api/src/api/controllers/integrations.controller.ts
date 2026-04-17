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

class StartConnectorReconciliationDto {
  @IsOptional()
  @IsUUID()
  endpointId?: string;

  @IsOptional()
  @IsIn(RECONCILIATION_SCOPES)
  scope?: "orders" | "payments" | "inventory" | "catalog" | "all";
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
}
