import {
  Body,
  Controller,
  Headers,
  Param,
  Post,
  Query,
  UnauthorizedException,
  BadRequestException,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { IsIn, IsInt, IsObject, IsOptional, Max, Min } from "class-validator";
import {
  IntegrationService,
  INTEGRATION_EVENT_TAXONOMY,
  IntegrationEventType,
  isIntegrationEventType,
} from "../../application/services/integration.service";
import { ConnectorRuntimeService } from "../../application/services/connector-runtime.service";

class ReceiveErpEventQueryDto {
  @IsOptional()
  @IsIn(["sync", "queue"])
  mode?: "sync" | "queue";
}

class ReceiveErpEventDto {
  @IsIn(INTEGRATION_EVENT_TAXONOMY as readonly string[])
  eventType!: IntegrationEventType;

  @IsOptional()
  @IsObject()
  data?: Record<string, any>;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  maxAttempts?: number;
}

@ApiTags("Integrations")
@Controller("v1/integrations/erp")
export class IntegrationsPublicController {
  constructor(
    private readonly integrationService: IntegrationService,
    private readonly connectorRuntimeService: ConnectorRuntimeService,
  ) {}

  @Post(":merchantId/events")
  @ApiOperation({ summary: "Receive ERP inbound events (public, signed)" })
  async receiveEvent(
    @Param("merchantId") merchantId: string,
    @Headers("x-integration-secret") secret: string,
    @Body() body: ReceiveErpEventDto,
    @Query() query: ReceiveErpEventQueryDto,
  ) {
    if (!merchantId || !secret) {
      throw new UnauthorizedException("Missing integration secret");
    }

    const endpoint =
      await this.integrationService.getOrCreateErpEndpoint(merchantId);

    if (String(endpoint.status || "").toUpperCase() !== "ACTIVE") {
      throw new BadRequestException("Integration endpoint is not active");
    }

    if (endpoint.secret !== secret) {
      throw new UnauthorizedException("Invalid integration secret");
    }

    if (!body?.eventType) {
      throw new BadRequestException("Missing eventType");
    }

    const normalizedType = String(body.eventType || "").trim();
    if (!isIntegrationEventType(normalizedType)) {
      throw new BadRequestException(
        "Unsupported eventType for runtime taxonomy",
      );
    }

    const runMode = String(query.mode || "sync").toLowerCase();
    if (runMode === "queue") {
      const queued = await this.connectorRuntimeService.enqueueEvent({
        merchantId,
        endpointId: endpoint.id,
        eventType: normalizedType,
        payload: body.data || {},
        maxAttempts: body.maxAttempts,
      });

      return {
        success: true,
        mode: "queue",
        eventType: normalizedType,
        ...queued,
      };
    }

    return this.integrationService.processErpEvent(
      merchantId,
      endpoint.id,
      normalizedType,
      body.data || {},
    );
  }
}
