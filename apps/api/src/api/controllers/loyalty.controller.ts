import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  Logger,
  UseGuards,
  Req,
  ParseIntPipe,
  DefaultValuePipe,
  BadRequestException,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiHeader,
  ApiSecurity,
  ApiBody,
} from "@nestjs/swagger";
import { Request } from "express";
import { MerchantApiKeyGuard } from "../../shared/guards/merchant-api-key.guard";
import {
  EntitlementGuard,
  RequiresFeature,
  RequiresAgent,
} from "../../shared/guards/entitlement.guard";
import { LoyaltyService } from "../../application/services/loyalty.service";

/**
 * Loyalty Controller
 *
 * Provides endpoints for loyalty program management including tiers, points, and promotions.
 * All endpoints are protected by MerchantApiKeyGuard and require LOYALTY feature + MARKETING_AGENT.
 */
@ApiTags("Loyalty")
@ApiSecurity("api-key")
@ApiHeader({
  name: "x-api-key",
  required: true,
  description: "Merchant API key",
})
@UseGuards(MerchantApiKeyGuard, EntitlementGuard)
@RequiresFeature("LOYALTY")
@RequiresAgent("MARKETING_AGENT")
@Controller("merchants/:merchantId/loyalty")
export class LoyaltyController {
  private readonly logger = new Logger(LoyaltyController.name);

  constructor(private readonly loyaltyService: LoyaltyService) {}

  private getMerchantIdFromParams(
    paramMerchantId: string,
    req: Request,
  ): string {
    // Use merchantId from guard if available, otherwise use param
    return (req as any).merchantId || paramMerchantId;
  }

  // ==================== TIERS ====================

  @Get("tiers")
  @ApiOperation({ summary: "Get all loyalty tiers for merchant" })
  @ApiParam({ name: "merchantId", description: "Merchant ID" })
  @ApiResponse({ status: 200, description: "List of loyalty tiers" })
  async getTiers(
    @Param("merchantId") merchantId: string,
    @Req() req: Request,
  ): Promise<any> {
    const resolvedMerchantId = this.getMerchantIdFromParams(merchantId, req);
    const tiers = await this.loyaltyService.getTiers(resolvedMerchantId);
    return { tiers };
  }

  @Post("tiers")
  @ApiOperation({ summary: "Create a new loyalty tier" })
  @ApiParam({ name: "merchantId", description: "Merchant ID" })
  @ApiBody({ description: "Tier data" })
  @ApiResponse({ status: 201, description: "Tier created" })
  async createTier(
    @Param("merchantId") merchantId: string,
    @Body() data: any,
    @Req() req: Request,
  ): Promise<any> {
    const resolvedMerchantId = this.getMerchantIdFromParams(merchantId, req);
    const tier = await this.loyaltyService.createTier(resolvedMerchantId, data);
    return { tier };
  }

  // ==================== CUSTOMER POINTS ====================

  @Get("customers/:customerPhone/points")
  @ApiOperation({ summary: "Get customer loyalty points" })
  @ApiParam({ name: "merchantId", description: "Merchant ID" })
  @ApiParam({ name: "customerPhone", description: "Customer phone number" })
  @ApiResponse({ status: 200, description: "Customer points data" })
  async getCustomerPoints(
    @Param("merchantId") merchantId: string,
    @Param("customerPhone") customerPhone: string,
    @Req() req: Request,
  ): Promise<any> {
    const resolvedMerchantId = this.getMerchantIdFromParams(merchantId, req);
    const points = await this.loyaltyService.getCustomerPoints(
      resolvedMerchantId,
      customerPhone,
    );
    return { points };
  }

  @Post("customers/:customerPhone/points")
  @ApiOperation({ summary: "Add points to customer account" })
  @ApiParam({ name: "merchantId", description: "Merchant ID" })
  @ApiParam({ name: "customerPhone", description: "Customer phone number" })
  @ApiBody({ description: "Points data" })
  @ApiResponse({ status: 200, description: "Points added" })
  async addPoints(
    @Param("merchantId") merchantId: string,
    @Param("customerPhone") customerPhone: string,
    @Body() data: { points: number; reason: string; orderId?: string },
    @Req() req: Request,
  ): Promise<any> {
    const resolvedMerchantId = this.getMerchantIdFromParams(merchantId, req);
    const result = await this.loyaltyService.addPoints(resolvedMerchantId, {
      customerId: customerPhone,
      points: data.points,
      type: "BONUS",
      source: "portal",
      description: data.reason,
      referenceId: data.orderId,
    });
    return { points: result };
  }

  @Post("customers/:customerPhone/redeem")
  @ApiOperation({ summary: "Redeem customer points" })
  @ApiParam({ name: "merchantId", description: "Merchant ID" })
  @ApiParam({ name: "customerPhone", description: "Customer phone number" })
  @ApiBody({ description: "Redeem data" })
  @ApiResponse({ status: 200, description: "Points redeemed" })
  async redeemPoints(
    @Param("merchantId") merchantId: string,
    @Param("customerPhone") customerPhone: string,
    @Body() data: { points: number; orderId?: string },
    @Req() req: Request,
  ): Promise<any> {
    const resolvedMerchantId = this.getMerchantIdFromParams(merchantId, req);
    const result = await this.loyaltyService.redeemPoints(
      resolvedMerchantId,
      customerPhone,
      data.points,
      data.orderId,
    );
    return { points: result };
  }

  // ==================== PROMOTIONS ====================

  @Get("promotions")
  @ApiOperation({ summary: "Get all promotions" })
  @ApiParam({ name: "merchantId", description: "Merchant ID" })
  @ApiQuery({
    name: "activeOnly",
    required: false,
    description: "Filter active only",
  })
  @ApiResponse({ status: 200, description: "List of promotions" })
  async getPromotions(
    @Param("merchantId") merchantId: string,
    @Query("activeOnly") activeOnly: string,
    @Req() req: Request,
  ): Promise<any> {
    const resolvedMerchantId = this.getMerchantIdFromParams(merchantId, req);
    const promotions = await this.loyaltyService.getPromotions(
      resolvedMerchantId,
      activeOnly === "true",
    );
    return { promotions };
  }

  @Post("promotions")
  @ApiOperation({ summary: "Create a new promotion" })
  @ApiParam({ name: "merchantId", description: "Merchant ID" })
  @ApiBody({ description: "Promotion data" })
  @ApiResponse({ status: 201, description: "Promotion created" })
  async createPromotion(
    @Param("merchantId") merchantId: string,
    @Body() data: any,
    @Req() req: Request,
  ): Promise<any> {
    const resolvedMerchantId = this.getMerchantIdFromParams(merchantId, req);
    const rawValue = data?.value;
    const parsedValue =
      typeof rawValue === "number"
        ? rawValue
        : rawValue !== undefined
          ? parseFloat(rawValue)
          : NaN;

    if (!Number.isFinite(parsedValue)) {
      throw new BadRequestException("قيمة العرض مطلوبة.");
    }

    const promotion = await this.loyaltyService.createPromotion(
      resolvedMerchantId,
      {
        ...data,
        value: parsedValue,
      },
    );
    return { promotion };
  }

  @Get("promotions/validate/:code")
  @ApiOperation({ summary: "Validate a promo code" })
  @ApiParam({ name: "merchantId", description: "Merchant ID" })
  @ApiParam({ name: "code", description: "Promo code" })
  @ApiQuery({
    name: "orderAmount",
    required: false,
    description: "Order amount for validation",
  })
  @ApiResponse({ status: 200, description: "Validation result" })
  async validatePromoCode(
    @Param("merchantId") merchantId: string,
    @Param("code") code: string,
    @Query("customerId") customerId?: string,
    @Query("orderAmount") orderAmount: string,
    @Req() req: Request,
  ): Promise<any> {
    const resolvedMerchantId = this.getMerchantIdFromParams(merchantId, req);
    if (!customerId) {
      throw new BadRequestException("required");
    }
    const amount = orderAmount ? parseFloat(orderAmount) : undefined;
    const result = await this.loyaltyService.validatePromoCode(
      resolvedMerchantId,
      code,
      customerId,
      amount,
    );
    return result;
  }

  @Post("promotions/:promotionId/deactivate")
  @ApiOperation({ summary: "Deactivate a promotion" })
  @ApiParam({ name: "merchantId", description: "Merchant ID" })
  @ApiParam({ name: "promotionId", description: "Promotion ID" })
  @ApiResponse({ status: 200, description: "Promotion deactivated" })
  async deactivatePromotion(
    @Param("merchantId") merchantId: string,
    @Param("promotionId") promotionId: string,
    @Req() req: Request,
  ): Promise<any> {
    const resolvedMerchantId = this.getMerchantIdFromParams(merchantId, req);
    await this.loyaltyService.deactivatePromotion(
      resolvedMerchantId,
      promotionId,
    );
    return { success: true };
  }

  @Post("promotions/:promotionId/activate")
  @ApiOperation({ summary: "Activate a promotion" })
  @ApiParam({ name: "merchantId", description: "Merchant ID" })
  @ApiParam({ name: "promotionId", description: "Promotion ID" })
  @ApiResponse({ status: 200, description: "Promotion activated" })
  async activatePromotion(
    @Param("merchantId") merchantId: string,
    @Param("promotionId") promotionId: string,
    @Req() req: Request,
  ): Promise<any> {
    const resolvedMerchantId = this.getMerchantIdFromParams(merchantId, req);
    await this.loyaltyService.activatePromotion(
      resolvedMerchantId,
      promotionId,
    );
    return { success: true };
  }

  // ==================== MEMBERS ====================

  @Post("members/enroll")
  @ApiOperation({ summary: "Enroll a customer into the loyalty program" })
  @ApiParam({ name: "merchantId", description: "Merchant ID" })
  @ApiBody({ description: "Customer enrollment data" })
  @ApiResponse({ status: 200, description: "Customer enrolled" })
  async enrollMember(
    @Param("merchantId") merchantId: string,
    @Body() data: { phone: string; name?: string },
    @Req() req: Request,
  ): Promise<any> {
    const resolvedMerchantId = this.getMerchantIdFromParams(merchantId, req);
    const member = await this.loyaltyService.enrollMember(
      resolvedMerchantId,
      data,
    );
    return { member };
  }

  @Get("members")
  @ApiOperation({
    summary: "Get loyalty program members (customers with points)",
  })
  @ApiParam({ name: "merchantId", description: "Merchant ID" })
  @ApiQuery({
    name: "page",
    required: false,
    description: "Page number",
    type: Number,
  })
  @ApiQuery({
    name: "limit",
    required: false,
    description: "Items per page",
    type: Number,
  })
  @ApiResponse({ status: 200, description: "List of loyalty members" })
  async getMembers(
    @Param("merchantId") merchantId: string,
    @Query("page", new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query("limit", new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Req() req: Request,
  ): Promise<any> {
    const resolvedMerchantId = this.getMerchantIdFromParams(merchantId, req);
    const result = await this.loyaltyService.getLoyaltyMembers(
      resolvedMerchantId,
      page,
      limit,
    );
    return result;
  }

  // ==================== ANALYTICS ====================

  @Get("analytics")
  @ApiOperation({ summary: "Get loyalty program analytics" })
  @ApiParam({ name: "merchantId", description: "Merchant ID" })
  @ApiResponse({ status: 200, description: "Loyalty analytics data" })
  async getAnalytics(
    @Param("merchantId") merchantId: string,
    @Req() req: Request,
  ): Promise<any> {
    const resolvedMerchantId = this.getMerchantIdFromParams(merchantId, req);
    const analytics =
      await this.loyaltyService.getLoyaltyAnalytics(resolvedMerchantId);
    return analytics;
  }
}
