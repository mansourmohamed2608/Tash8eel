import {
  Body,
  Controller,
  Headers,
  Param,
  Post,
  UnauthorizedException,
  BadRequestException,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  IntegrationService,
  IntegrationEventType,
} from "../../application/services/integration.service";

@ApiTags("Integrations")
@Controller("v1/integrations/erp")
export class IntegrationsPublicController {
  constructor(private readonly integrationService: IntegrationService) {}

  @Post(":merchantId/events")
  @ApiOperation({ summary: "Receive ERP inbound events (public, signed)" })
  async receiveEvent(
    @Param("merchantId") merchantId: string,
    @Headers("x-integration-secret") secret: string,
    @Body() body: { eventType: IntegrationEventType; data?: any },
  ) {
    if (!merchantId || !secret) {
      throw new UnauthorizedException("Missing integration secret");
    }

    const endpoint =
      await this.integrationService.getOrCreateErpEndpoint(merchantId);
    if (endpoint.secret !== secret) {
      throw new UnauthorizedException("Invalid integration secret");
    }

    if (!body?.eventType) {
      throw new BadRequestException("Missing eventType");
    }

    return this.integrationService.processErpEvent(
      merchantId,
      endpoint.id,
      body.eventType,
      body.data || {},
    );
  }
}
