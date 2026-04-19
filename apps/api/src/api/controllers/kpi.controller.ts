import { Controller, Get, Query, UseGuards, Logger } from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiQuery,
} from "@nestjs/swagger";
import { KpiService } from "../../application/services/kpi.service";
import { MerchantApiKeyGuard } from "../../shared/guards/merchant-api-key.guard";
import {
  EntitlementGuard,
  RequiresFeature,
} from "../../shared/guards/entitlement.guard";
import { MerchantId } from "../../shared/decorators/merchant-id.decorator";

@ApiTags("KPIs")
@ApiSecurity("x-api-key")
@UseGuards(MerchantApiKeyGuard, EntitlementGuard)
@RequiresFeature("KPI_DASHBOARD")
@Controller("v1/kpis")
export class KpiController {
  private readonly logger = new Logger(KpiController.name);

  constructor(private readonly kpiService: KpiService) {}

  @Get("recovered-carts")
  @ApiOperation({
    summary: "Get cart recovery statistics",
    description: "Statistics on abandoned carts and recovery rate",
  })
  @ApiQuery({
    name: "days",
    required: false,
    type: Number,
    description: "Number of days to analyze (default: 30)",
  })
  @ApiResponse({ status: 200, description: "Cart recovery stats" })
  async getRecoveredCartStats(
    @MerchantId() merchantId: string,
    @Query("days") days?: number,
  ) {
    return this.kpiService.getRecoveredCartStats(merchantId, days || 30);
  }

  @Get("delivery-failures")
  @ApiOperation({
    summary: "Get delivery failure statistics",
    description: "Statistics on delivery failures, reasons, and trends",
  })
  @ApiQuery({
    name: "days",
    required: false,
    type: Number,
    description: "Number of days to analyze (default: 30)",
  })
  @ApiResponse({ status: 200, description: "Delivery failure stats" })
  async getDeliveryFailureStats(
    @MerchantId() merchantId: string,
    @Query("days") days?: number,
  ) {
    return this.kpiService.getDeliveryFailureStats(merchantId, days || 30);
  }

  @Get("agent-performance")
  @ApiOperation({
    summary: "Get AI agent performance statistics",
    description:
      "Statistics on agent tasks, takeovers, confidence, and token usage",
  })
  @ApiQuery({
    name: "days",
    required: false,
    type: Number,
    description: "Number of days to analyze (default: 30)",
  })
  @ApiResponse({ status: 200, description: "Agent performance stats" })
  async getAgentPerformanceStats(
    @MerchantId() merchantId: string,
    @Query("days") days?: number,
  ) {
    return this.kpiService.getAgentPerformanceStats(merchantId, days || 30);
  }

  @Get("revenue")
  @ApiOperation({
    summary: "Get revenue KPIs",
    description:
      "Revenue metrics including trends, top products, payment methods, and at-risk payments",
  })
  @ApiQuery({
    name: "days",
    required: false,
    type: Number,
    description: "Number of days to analyze (default: 30)",
  })
  @ApiResponse({ status: 200, description: "Revenue KPIs" })
  async getRevenueKpis(
    @MerchantId() merchantId: string,
    @Query("days") days?: number,
  ) {
    return this.kpiService.getRevenueKpis(merchantId, days || 30);
  }

  @Get("customers")
  @ApiOperation({
    summary: "Get customer KPIs",
    description:
      "Customer metrics including acquisition, retention, top customers, and geographic distribution",
  })
  @ApiQuery({
    name: "days",
    required: false,
    type: Number,
    description: "Number of days to analyze (default: 30)",
  })
  @ApiResponse({ status: 200, description: "Customer KPIs" })
  async getCustomerKpis(
    @MerchantId() merchantId: string,
    @Query("days") days?: number,
  ) {
    return this.kpiService.getCustomerKpis(merchantId, days || 30);
  }

  @Get("summary")
  @ApiOperation({
    summary: "Get all KPIs summary",
    description: "Combined summary of all major KPIs",
  })
  @ApiQuery({
    name: "days",
    required: false,
    type: Number,
    description: "Number of days to analyze (default: 30)",
  })
  @ApiResponse({ status: 200, description: "All KPIs summary" })
  async getAllKpis(
    @MerchantId() merchantId: string,
    @Query("days") days?: number,
  ) {
    const periodDays = days || 30;

    const [
      recoveredCarts,
      deliveryFailures,
      agentPerformance,
      revenue,
      customers,
    ] = await Promise.all([
      this.kpiService.getRecoveredCartStats(merchantId, periodDays),
      this.kpiService.getDeliveryFailureStats(merchantId, periodDays),
      this.kpiService.getAgentPerformanceStats(merchantId, periodDays),
      this.kpiService.getRevenueKpis(merchantId, periodDays),
      this.kpiService.getCustomerKpis(merchantId, periodDays),
    ]);

    return {
      periodDays,
      recoveredCarts,
      deliveryFailures,
      agentPerformance,
      revenue,
      customers,
    };
  }
}
