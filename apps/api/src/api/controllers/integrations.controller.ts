import {
  Controller,
  Get,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
  BadRequestException,
  UnauthorizedException,
  Body,
} from "@nestjs/common";
import { ApiHeader, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import { Request } from "express";
import { MerchantApiKeyGuard } from "../../shared/guards/merchant-api-key.guard";
import { IntegrationService } from "../../application/services/integration.service";
import { AuditService } from "../../application/services/audit.service";

@ApiTags("Integrations")
@Controller("v1/portal/integrations")
@UseGuards(MerchantApiKeyGuard)
@ApiHeader({
  name: "X-API-Key",
  description: "Merchant API Key",
  required: true,
})
export class IntegrationsController {
  constructor(
    private readonly integrationService: IntegrationService,
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
  @ApiOperation({ summary: "Get ERP integration config" })
  async getErpConfig(@Req() req: Request) {
    const merchantId = this.getMerchantId(req);
    return this.integrationService.getErpConfig(merchantId);
  }

  @Put("erp/config")
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
  @ApiOperation({ summary: "Pull ERP data via connector (orders/payments)" })
  async pullErp(
    @Req() req: Request,
    @Body() body: { mode?: "orders" | "payments" | "both" },
  ) {
    const merchantId = this.getMerchantId(req);
    return this.integrationService.pullErpEvents(
      merchantId,
      body?.mode || "both",
    );
  }

  @Get("erp/events")
  @ApiOperation({ summary: "List ERP integration events" })
  @ApiQuery({ name: "limit", required: false })
  @ApiQuery({ name: "offset", required: false })
  async listEvents(
    @Req() req: Request,
    @Query("limit") limit?: number,
    @Query("offset") offset?: number,
  ) {
    const merchantId = this.getMerchantId(req);
    const safeLimit = Number.isFinite(Number(limit)) ? Number(limit) : 50;
    const safeOffset = Number.isFinite(Number(offset)) ? Number(offset) : 0;
    return this.integrationService.listEvents(
      merchantId,
      safeLimit,
      safeOffset,
    );
  }
}
